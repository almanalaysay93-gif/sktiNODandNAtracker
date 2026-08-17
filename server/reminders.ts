/**
 * Daily license renewal reminder engine.
 *
 * Rules (from spec):
 * - For every active (non-archived) nurse license, generate a reminder when
 *   today >= expiryDate - thresholdDays, once per threshold per renewal cycle.
 * - Never duplicate: unique constraint on (credentialId, thresholdDays, renewalCycleKey).
 * - Missed runs: if the threshold was crossed before, generate now (catchup).
 * - Archived nurses never generate routine reminders.
 * - Expired licenses are flagged (mark active reminder status expired + urgent notification).
 * - Renewed license (new credential record = new renewalCycleKey) starts a new cycle.
 */
import { eq, isNull, sql } from "drizzle-orm";
import { licenseReminders } from "../drizzle/schema";
import {
  acknowledgeReminder,
  createNotification,
  createNotificationsBatch,
  getDb,
  listAreas,
  listReminders,
  countUnreadNotifications,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  markReminderExpiredByCredential,
} from "./db";
import { daysUntilExpiry, deriveLicenseStatus } from "../shared/nursetrack";

export const DEFAULT_THRESHOLDS = [365, 180] as const;

interface CredentialRow {
  id: number;
  nurseId: number;
  credentialTypeId: number;
  expiryDate: Date | string;
  renewalCycleKey: string;
  nurse: {
    id: number;
    employeeId: string;
    firstName: string;
    middleName: string | null;
    lastName: string;
    suffix: string | null;
    archivedAt: Date | null;
    currentAreaId: number | null;
  };
}

async function fetchActiveCredentials(): Promise<CredentialRow[]> {
  const db = await getDb();
  if (!db) return [];
  const nursesTable = await import("../drizzle/schema").then((m) => m.nurses);
  const rows = await db
    .select({
      id: sql<number>`nurseCredentials.id`,
      nurseId: sql<number>`nurseCredentials.nurseId`,
      credentialTypeId: sql<number>`nurseCredentials.credentialTypeId`,
      expiryDate: sql<Date>`nurseCredentials.expiryDate`,
      renewalCycleKey: sql<string>`nurseCredentials.renewalCycleKey`,
      employeeId: sql<string>`nurses.employeeId`,
      firstName: sql<string>`nurses.firstName`,
      middleName: sql<string>`nurses.middleName`,
      lastName: sql<string>`nurses.lastName`,
      suffix: sql<string>`nurses.suffix`,
      archivedAt: sql<Date>`nurses.archivedAt`,
      currentAreaId: sql<number>`nurses.currentAreaId`,
    })
    .from(sql`nurseCredentials`)
    .innerJoin(sql`nurses`, sql`nurses.id = nurseCredentials.nurseId`)
    .where(isNull(sql`nurses.archivedAt`));
  return rows.map((r: Record<string, unknown>) => ({
    id: Number(r.id),
    nurseId: Number(r.nurseId),
    credentialTypeId: Number(r.credentialTypeId),
    expiryDate: r.expiryDate as Date,
    renewalCycleKey: String(r.renewalCycleKey),
    nurse: {
      id: Number(r.nurseId),
      employeeId: String(r.employeeId),
      firstName: String(r.firstName),
      middleName: (r.middleName as string | null) ?? null,
      lastName: String(r.lastName),
      suffix: (r.suffix as string | null) ?? null,
      archivedAt: (r.archivedAt as Date | null) ?? null,
      currentAreaId: r.currentAreaId != null ? Number(r.currentAreaId) : null,
    },
  }));
}

/** Run the daily reminder pass. Idempotent — safe to call any time. */
export async function runDailyReminders(today: string, thresholds: readonly number[] = DEFAULT_THRESHOLDS) {
  const db = await getDb();
  const results = { created: 0, skippedExisting: 0, expiredCredentials: 0, archivedSkipped: 0 };
  const credentials = await fetchActiveCredentials();
  if (!db) return results;

  const areaRows = await listAreas(false);
  const areaById = new Map(areaRows.map((a) => [a.id, a.name]));

  // Phase 1 — classify credentials in memory: expired vs. due renewal reminders.
  const duePairs: Array<{ cred: CredentialRow; threshold: number; days: number; areaName: string }> = [];
  const expiredIds: number[] = [];
  const expiredNotes: Array<{ cred: CredentialRow }> = [];
  for (const cred of credentials) {
    if (cred.nurse.archivedAt) {
      results.archivedSkipped++;
      continue;
    }
    const days = daysUntilExpiry(String(cred.expiryDate), today);
    const status = deriveLicenseStatus(String(cred.expiryDate), today);

    // Expired license — mark any active reminders for it expired and notify once per day handled by reminder status.
    if (status === "Expired") {
      expiredIds.push(cred.id);
      expiredNotes.push({ cred });
      continue;
    }

    for (const threshold of thresholds) {
      if (days > threshold) continue; // not yet due
      const areaName = cred.nurse.currentAreaId ? areaById.get(cred.nurse.currentAreaId) ?? "Unknown area" : "Unassigned";
      duePairs.push({ cred, threshold, days, areaName });
    }
  }

  // Phase 2 — bulk-insert due reminders. INSERT IGNORE on uniq_reminder_cycle
  // makes this idempotent: already-seen (credential, threshold, cycle) pairs are skipped.
  if (duePairs.length > 0) {
    const rows = duePairs.map(({ cred, threshold }) => ({
      credentialId: cred.id,
      thresholdDays: threshold,
      renewalCycleKey: cred.renewalCycleKey,
      triggerDate: new Date(new Date(`${today}T00:00:00`).getTime() + threshold * 86400000),
    }));
    await db.execute(sql`
      INSERT IGNORE INTO ${licenseReminders}
      (credentialId, thresholdDays, renewalCycleKey, triggerDate)
      VALUES ${sql.join(
        rows.map((r) => sql`(${r.credentialId}, ${r.thresholdDays}, ${r.renewalCycleKey}, ${r.triggerDate})`),
        sql`, `,
      )}
    `);
    results.created += duePairs.length;
  }

  // Phase 3 — expired credentials: mark their active reminders expired and send
  // one expired notification each (createNotification is idempotent via INSERT IGNORE
  // on uniq_notif_day).
  for (const id of expiredIds) {
    await markReminderExpiredByCredential(id);
  }
  for (const { cred } of expiredNotes) {
    await createNotification({
      type: "license.expired",
      severity: "urgent_or_expired",
      title: `License expired — ${cred.nurse.firstName} ${cred.nurse.lastName}`,
      message: `The license (${cred.renewalCycleKey}) for ${cred.nurse.firstName} ${cred.nurse.lastName} expired. Mark renewal as complete to start a new cycle.`,
      nurseId: cred.nurseId,
      relatedEntityType: "credential",
      relatedEntityId: cred.id,
    });
  }
  results.expiredCredentials = expiredIds.length;

  // Phase 4 — one bulk notification insert for all due renewal reminders.
  // INSERT IGNORE on uniq_notif_day guarantees no duplicate notifications
  // across repeated runs on the same day.
  const notifPayloads = duePairs.map(({ cred, threshold, days }) => ({
    type: "license.renewalReminder",
    severity: threshold >= 365 ? "attention" : "upcoming_renewal",
    title: `${threshold === 365 ? "1-year" : "6-month"} renewal reminder — ${cred.nurse.firstName} ${cred.nurse.lastName}`,
    message: `${cred.nurse.firstName} ${cred.nurse.lastName} has a license expiring in ${days <= 0 ? "about " + (Math.abs(days) + 1) + " day(s) (due " + String(cred.expiryDate).slice(0, 10) + ")" : days + " days"}. Review the license and begin renewal.`,
    nurseId: cred.nurseId,
    relatedEntityType: "credential",
    relatedEntityId: cred.id,
  }));
  if (notifPayloads.length > 0) {
    await createNotificationsBatch(notifPayloads);
  }

  return results;
}

export {
  acknowledgeReminder,
  listReminders,
  createNotification,
  listNotifications,
  countUnreadNotifications,
  markNotificationRead,
  markAllNotificationsRead,
};
