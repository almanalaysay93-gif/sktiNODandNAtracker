import { eq, inArray, sql } from "drizzle-orm";
import { getDb } from "./db";
import { getSqliteDb } from "./localDb";
import {
  nurses,
  nurseCredentials,
  nurseTrainings,
  areaAssignments,
  customCalendarEvents,
  notifications,
  type Nurse,
} from "../drizzle/schema";

function normName(first: string, last: string): string {
  return `${last.trim()} ${first.trim()}`.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export async function deduplicateDatabase() {
  const db = await getDb();
  let mergedNursesCount = 0;
  let deletedDupNursesCount = 0;
  let deduplicatedTrainingsCount = 0;
  let deduplicatedCredentialsCount = 0;

  if (db) {
    // 1. Fetch all nurses
    const allNurses = await db.select().from(nurses);
    const groups = new Map<string, typeof allNurses>();

    for (const n of allNurses) {
      const key = normName(n.firstName, n.lastName);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(n);
    }

    const entries = Array.from(groups.entries());
    for (let i = 0; i < entries.length; i++) {
      const group = entries[i][1];
      if (group.length <= 1) continue;

      // Pick primary: prefer one with linkedUserId, then accountEmail, then lowest ID
      const sorted = [...group].sort((a: Nurse, b: Nurse) => {
        if (a.linkedUserId && !b.linkedUserId) return -1;
        if (!a.linkedUserId && b.linkedUserId) return 1;
        if (a.accountEmail && !b.accountEmail) return -1;
        if (!a.accountEmail && b.accountEmail) return 1;
        return a.id - b.id;
      });
      const primary = sorted[0];
      const duplicates = group.filter((n: Nurse) => n.id !== primary.id);

      for (const dup of duplicates) {
        // Merge missing fields to primary
        const updates: Record<string, unknown> = {};
        if (!primary.accountEmail && dup.accountEmail) updates.accountEmail = dup.accountEmail;
        if (!primary.currentAreaId && dup.currentAreaId) updates.currentAreaId = dup.currentAreaId;
        if (!primary.dateHired && dup.dateHired) updates.dateHired = dup.dateHired;
        if (!primary.position && dup.position) updates.position = dup.position;
        if (!primary.contactNumber && dup.contactNumber) updates.contactNumber = dup.contactNumber;

        if (Object.keys(updates).length > 0) {
          await db.update(nurses).set(updates).where(eq(nurses.id, primary.id));
        }

        // Reassign area assignments
        await db.update(areaAssignments).set({ nurseId: primary.id }).where(eq(areaAssignments.nurseId, dup.id));

        // Reassign custom calendar events
        await db.update(customCalendarEvents).set({ nurseId: primary.id }).where(eq(customCalendarEvents.nurseId, dup.id));

        // Reassign notifications
        await db.update(notifications).set({ nurseId: primary.id }).where(eq(notifications.nurseId, dup.id));

        // Reassign credentials
        const dupCreds = await db.select().from(nurseCredentials).where(eq(nurseCredentials.nurseId, dup.id));
        const primCreds = await db.select().from(nurseCredentials).where(eq(nurseCredentials.nurseId, primary.id));

        for (const dc of dupCreds) {
          const exists = primCreds.some(
            (pc) => pc.credentialTypeId === dc.credentialTypeId && pc.licenseNumber === dc.licenseNumber
          );
          if (exists) {
            await db.delete(nurseCredentials).where(eq(nurseCredentials.id, dc.id));
            deduplicatedCredentialsCount++;
          } else {
            await db.update(nurseCredentials).set({ nurseId: primary.id }).where(eq(nurseCredentials.id, dc.id));
          }
        }

        // Reassign trainings
        const dupTrainings = await db.select().from(nurseTrainings).where(eq(nurseTrainings.nurseId, dup.id));
        const primTrainings = await db.select().from(nurseTrainings).where(eq(nurseTrainings.nurseId, primary.id));

        for (const dt of dupTrainings) {
          const exists = primTrainings.some(
            (pt) =>
              pt.trainingId === dt.trainingId &&
              String(pt.completionDate ?? pt.scheduledDate).slice(0, 10) ===
                String(dt.completionDate ?? dt.scheduledDate).slice(0, 10)
          );
          if (exists) {
            await db.delete(nurseTrainings).where(eq(nurseTrainings.id, dt.id));
            deduplicatedTrainingsCount++;
          } else {
            await db.update(nurseTrainings).set({ nurseId: primary.id }).where(eq(nurseTrainings.id, dt.id));
          }
        }

        // Finally delete the duplicate nurse row
        await db.delete(nurses).where(eq(nurses.id, dup.id));
        deletedDupNursesCount++;
      }
      mergedNursesCount++;
    }

    // 2. Deduplicate duplicate nurseTrainings within individual nurses (same nurseId, trainingId, completionDate)
    const allTrainings = await db.select().from(nurseTrainings);
    const seenTrainings = new Set<string>();
    for (const t of allTrainings) {
      const dateStr = String(t.completionDate ?? t.scheduledDate ?? "").slice(0, 10);
      const key = `${t.nurseId}-${t.trainingId}-${dateStr}`;
      if (seenTrainings.has(key)) {
        await db.delete(nurseTrainings).where(eq(nurseTrainings.id, t.id));
        deduplicatedTrainingsCount++;
      } else {
        seenTrainings.add(key);
      }
    }
  } else {
    // SQLite local fallback
    const sqlite = getSqliteDb();
    const allNurses = sqlite.prepare("SELECT * FROM nurses").all() as any[];
    const groups = new Map<string, any[]>();
    for (const n of allNurses) {
      const key = normName(n.firstName, n.lastName);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(n);
    }

    const sqliteEntries = Array.from(groups.entries());
    for (let i = 0; i < sqliteEntries.length; i++) {
      const group = sqliteEntries[i][1];
      if (group.length <= 1) continue;
      const sorted = [...group].sort((a: any, b: any) => {
        if (a.linkedUserId && !b.linkedUserId) return -1;
        if (!a.linkedUserId && b.linkedUserId) return 1;
        if (a.accountEmail && !b.accountEmail) return -1;
        if (!a.accountEmail && b.accountEmail) return 1;
        return a.id - b.id;
      });
      const primary = sorted[0];
      const duplicates = group.filter((n: any) => n.id !== primary.id);

      for (const dup of duplicates) {
        sqlite.prepare("UPDATE areaAssignments SET nurseId = ? WHERE nurseId = ?").run(primary.id, dup.id);
        sqlite.prepare("UPDATE customCalendarEvents SET nurseId = ? WHERE nurseId = ?").run(primary.id, dup.id);
        sqlite.prepare("UPDATE notifications SET nurseId = ? WHERE nurseId = ?").run(primary.id, dup.id);
        sqlite.prepare("UPDATE nurseCredentials SET nurseId = ? WHERE nurseId = ?").run(primary.id, dup.id);
        sqlite.prepare("UPDATE nurseTrainings SET nurseId = ? WHERE nurseId = ?").run(primary.id, dup.id);
        sqlite.prepare("DELETE FROM nurses WHERE id = ?").run(dup.id);
        deletedDupNursesCount++;
      }
      mergedNursesCount++;
    }
  }

  return {
    mergedNursesGroups: mergedNursesCount,
    deletedDuplicateNurses: deletedDupNursesCount,
    deduplicatedTrainings: deduplicatedTrainingsCount,
    deduplicatedCredentials: deduplicatedCredentialsCount,
  };
}
