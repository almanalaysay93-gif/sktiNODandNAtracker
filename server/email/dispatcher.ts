import { getDb, isEmailDuplicate } from "../db";
import { getSqliteDb } from "../localDb";
import { daysUntilExpiry, todayDate, nurseFullName, dateKey } from "../../shared/nursetrack";
import { renderLicenseExpiryEmail, renderSeminarReminderEmail } from "./templates";
import { sendEmail } from "./service";

const EXPIRY_THRESHOLDS = [
  { days: 90, key: "90d" },
  { days: 60, key: "60d" },
  { days: 30, key: "30d" },
  { days: 7, key: "7d" },
  { days: 0, key: "expired" },
];

const APP_URL = process.env.APP_URL || "http://localhost:3000";

interface ActiveNurseWithCredentials {
  nurseId: number;
  fullName: string;
  accountEmail: string | null;
  linkedUserId: number | null;
  credentialId: number;
  typeName: string;
  licenseNumber: string;
  expiryDate: string;
  renewalCycleKey: string;
}

export async function fetchLinkedNursesWithExpiringCredentials(): Promise<ActiveNurseWithCredentials[]> {
  const db = await getDb();
  if (db) {
    // MySQL query
    const rows = await db.execute(
      `SELECT n.id as nurseId, n.firstName, n.middleName, n.lastName, n.suffix, n.accountEmail, n.linkedUserId,
              c.id as credentialId, c.licenseNumber, c.expiryDate, c.renewalCycleKey, ct.name as typeName
       FROM nurses n
       INNER JOIN nurseCredentials c ON c.nurseId = n.id
       LEFT JOIN credentialTypes ct ON ct.id = c.credentialTypeId
       WHERE n.archivedAt IS NULL AND n.linkedUserId IS NOT NULL AND n.accountEmail IS NOT NULL`
    );
    const list = (rows[0] as any[]) || [];
    return list.map((r) => ({
      nurseId: Number(r.nurseId),
      fullName: nurseFullName(r),
      accountEmail: r.accountEmail,
      linkedUserId: r.linkedUserId,
      credentialId: Number(r.credentialId),
      typeName: r.typeName || "PRC Registered Nurse License",
      licenseNumber: r.licenseNumber || "—",
      expiryDate: dateKey(r.expiryDate),
      renewalCycleKey: String(r.renewalCycleKey),
    }));
  }

  const sqlite = getSqliteDb();
  const rows = sqlite.prepare(`
    SELECT n.id as nurseId, n.firstName, n.middleName, n.lastName, n.suffix, n.accountEmail, n.linkedUserId,
           c.id as credentialId, c.licenseNumber, c.expiryDate, c.renewalCycleKey, ct.name as typeName
    FROM nurses n
    INNER JOIN nurseCredentials c ON c.nurseId = n.id
    LEFT JOIN credentialTypes ct ON ct.id = c.credentialTypeId
    WHERE n.archivedAt IS NULL AND n.linkedUserId IS NOT NULL AND n.accountEmail IS NOT NULL
  `).all() as any[];

  return rows.map((r) => ({
    nurseId: Number(r.nurseId),
    fullName: nurseFullName(r),
    accountEmail: r.accountEmail,
    linkedUserId: r.linkedUserId,
    credentialId: Number(r.credentialId),
    typeName: r.typeName || "PRC Registered Nurse License",
    licenseNumber: r.licenseNumber || "—",
    expiryDate: dateKey(r.expiryDate),
    renewalCycleKey: String(r.renewalCycleKey),
  }));
}

/**
 * License expiration daily pass.
 * Evaluates credentials for linked nurses against 90d, 60d, 30d, 7d, and expired milestones.
 * Skips unlinked nurses or already-notified thresholds.
 */
export async function runLicenseExpiryEmailPass(today = todayDate()): Promise<{ processed: number; sent: number; skipped: number }> {
  const records = await fetchLinkedNursesWithExpiringCredentials();
  let processed = 0;
  let sent = 0;
  let skipped = 0;

  for (const record of records) {
    if (!record.accountEmail || !record.expiryDate) {
      skipped++;
      continue;
    }

    const daysLeft = daysUntilExpiry(record.expiryDate, today);

    for (const thresh of EXPIRY_THRESHOLDS) {
      // Check if threshold applies
      const matches = thresh.days === 0 ? daysLeft <= 0 : daysLeft <= thresh.days && daysLeft > (thresh.days === 7 ? 0 : thresh.days - (thresh.days === 90 ? 30 : thresh.days === 60 ? 30 : 23));
      
      if (!matches) continue;

      processed++;

      // Check deduplication
      const isDup = await isEmailDuplicate({
        nurseId: record.nurseId,
        emailType: "license_expiry",
        referenceId: record.credentialId,
        thresholdKey: `${thresh.key}-${record.renewalCycleKey}`,
      });

      if (isDup) {
        skipped++;
        continue;
      }

      const html = renderLicenseExpiryEmail({
        nurseName: record.fullName,
        licenseType: record.typeName,
        licenseNumber: record.licenseNumber,
        expiryDateStr: record.expiryDate,
        daysRemaining: daysLeft,
        thresholdKey: thresh.key,
        actionUrl: `${APP_URL}/me`,
      });

      const subject = daysLeft <= 0
        ? `[URGENT] License Expired: ${record.typeName} (${record.licenseNumber})`
        : daysLeft <= 30
        ? `[Action Required] ${record.typeName} expires in ${daysLeft} days`
        : `Renewal Notice: ${record.typeName} expires in ${daysLeft} days`;

      await sendEmail({
        to: record.accountEmail,
        subject,
        html,
        nurseId: record.nurseId,
        emailType: "license_expiry",
        referenceId: record.credentialId,
        thresholdKey: `${thresh.key}-${record.renewalCycleKey}`,
      });

      sent++;
      break; // Send highest matching threshold for this credential today
    }
  }

  return { processed, sent, skipped };
}

/**
 * Seminar reminder 48-hour pass.
 * Finds training events scheduled within 48 to 72 hours, retrieves registered attendees who are linked,
 * and sends reminder emails if not already sent.
 */
export async function runUpcomingSeminarEmailPass(): Promise<{ processed: number; sent: number }> {
  const sqlite = getSqliteDb();
  const today = todayDate();
  
  // Look for events with startDate between now+1 day and now+3 days
  const upcomingEvents = sqlite.prepare(`
    SELECT e.id, e.startDate, e.startTime, e.venue, c.name as trainingName
    FROM trainingEvents e
    INNER JOIN trainingCatalog c ON c.id = e.trainingId
    WHERE date(e.startDate) >= date('now', '+1 day') AND date(e.startDate) <= date('now', '+3 days')
  `).all() as any[];

  let processed = 0;
  let sent = 0;

  for (const ev of upcomingEvents) {
    // Get attendees with linked accounts
    const attendees = sqlite.prepare(`
      SELECT n.id as nurseId, n.firstName, n.middleName, n.lastName, n.suffix, n.accountEmail
      FROM nurseTrainings t
      INNER JOIN nurses n ON n.id = t.nurseId
      WHERE t.eventId = ? AND n.archivedAt IS NULL AND n.linkedUserId IS NOT NULL AND n.accountEmail IS NOT NULL
    `).all(ev.id) as any[];

    for (const att of attendees) {
      processed++;
      const isDup = await isEmailDuplicate({
        nurseId: att.nurseId,
        emailType: "seminar_reminder",
        referenceId: ev.id,
        thresholdKey: "48h",
      });

      if (isDup) continue;

      const html = renderSeminarReminderEmail({
        nurseName: nurseFullName(att),
        seminarTitle: ev.trainingName,
        scheduledDateStr: `${ev.startDate}${ev.startTime ? ` at ${ev.startTime}` : ""}`,
        venue: ev.venue,
        actionUrl: `${APP_URL}/me`,
      });

      await sendEmail({
        to: att.accountEmail,
        subject: `Reminder: ${ev.trainingName} in 48 Hours`,
        html,
        nurseId: att.nurseId,
        emailType: "seminar_reminder",
        referenceId: ev.id,
        thresholdKey: "48h",
      });

      sent++;
    }
  }

  return { processed, sent };
}
