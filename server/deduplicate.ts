import { eq, inArray, sql } from "drizzle-orm";
import { getDb } from "./db";
import { getSqliteDb } from "./localDb";
import {
  areas,
  areaAssignments,
  areaTrainingRequirements,
  nurses,
  nurseCredentials,
  nurseTrainings,
  customCalendarEvents,
  notifications,
  type Nurse,
} from "../drizzle/schema";

export const CANONICAL_AREAS = [
  { code: "NEPHRO-OFFICE", name: "Nephrology Office", description: "Nephrology Nursing Office & Administrative Center", sortOrder: 1 },
  { code: "PD", name: "Peritoneal Dialysis", description: "Peritoneal Dialysis Unit & Outpatient CAPD/APD", sortOrder: 2 },
  { code: "OTSU-SHARE", name: "OTSU / SHARE", description: "Organ Transplant Specialty Unit & SHARE Programs", sortOrder: 3 },
  { code: "RDU-MAIN", name: "RDU Main", description: "Renal Dialysis Unit - Main Building (Station 1-28)", sortOrder: 4 },
  { code: "RDU-ANNEX", name: "RDU Annex", description: "Renal Dialysis Unit - Annex Center", sortOrder: 5 },
  { code: "SKTI-WARD", name: "SKTI Service Ward", description: "Southern Philippines Kidney Transplant Institute - Inpatient Ward", sortOrder: 6 },
  { code: "SKTI-PAY", name: "SKTI Payward", description: "SKTI Pay Patients Inpatient Unit", sortOrder: 7 },
  { code: "SKTI-ICU", name: "SKTI ICU", description: "SKTI Intensive Care Unit", sortOrder: 8 },
  { code: "TRIAGE", name: "Triage & Receiving", description: "Nephrology Triage and Outpatient Receiving", sortOrder: 9 },
] as const;

export function canonicalAreaInfo(rawName: string): { code: string; name: string } | null {
  const s = rawName.trim().toUpperCase();
  if (s.includes("MAIN") || s.includes("RDU-MAIN") || s.includes("DU MAIN")) {
    return { code: "RDU-MAIN", name: "RDU Main" };
  }
  if (s.includes("ANNEX") || s.includes("RDU-ANNEX") || s.includes("DU ANNEX")) {
    return { code: "RDU-ANNEX", name: "RDU Annex" };
  }
  if (s.includes("OTSU") || s.includes("SHARE")) {
    return { code: "OTSU-SHARE", name: "OTSU / SHARE" };
  }
  if (s.includes("PERITONEAL") || s === "PD" || s.startsWith("PD ") || s.includes("CAPD")) {
    return { code: "PD", name: "Peritoneal Dialysis" };
  }
  if (s.includes("ICU")) {
    return { code: "SKTI-ICU", name: "SKTI ICU" };
  }
  if (s.includes("PAY")) {
    return { code: "SKTI-PAY", name: "SKTI Payward" };
  }
  if (s.includes("WARD") || s.includes("SERVICE")) {
    return { code: "SKTI-WARD", name: "SKTI Service Ward" };
  }
  if (s.includes("OFFICE") || s.includes("ADMIN")) {
    return { code: "NEPHRO-OFFICE", name: "Nephrology Office" };
  }
  if (s.includes("TRIAGE") || s.includes("RECEIVING")) {
    return { code: "TRIAGE", name: "Triage & Receiving" };
  }
  return null;
}

class DisjointSet {
  private parent = new Map<number, number>();

  find(i: number): number {
    if (!this.parent.has(i)) this.parent.set(i, i);
    const p = this.parent.get(i)!;
    if (p === i) return i;
    const root = this.find(p);
    this.parent.set(i, root);
    return root;
  }

  union(i: number, j: number) {
    const rootI = this.find(i);
    const rootJ = this.find(j);
    if (rootI !== rootJ) {
      this.parent.set(rootI, rootJ);
    }
  }
}

/** Normalize token set for names: ignores case, punctuation, and single-letter middle initials */
function nameTokens(fullName: string): string[] {
  return fullName
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1)
    .sort();
}

function nameTokenKey(first: string, last: string, middle?: string | null): string {
  const tokens = nameTokens(`${first} ${middle ?? ""} ${last}`);
  return tokens.join("|");
}

function shortNameKey(first: string, last: string): string {
  const firstWord = first.trim().split(/\s+/)[0]?.toLowerCase().replace(/[^a-z0-9]/g, "") ?? "";
  const lastWord = last.trim().split(/\s+/).pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") ?? "";
  if (firstWord.length < 2 || lastWord.length < 2) return "";
  return `${lastWord}|${firstWord}`;
}

function cleanIdKey(idStr: string | null | undefined): string {
  if (!idStr) return "";
  const clean = idStr.trim().replace(/[^a-zA-Z0-9]/g, "");
  if (/^\d+$/.test(clean)) {
    return clean.replace(/^0+/, "");
  }
  return clean.toLowerCase();
}

export async function deduplicateDatabase() {
  const db = await getDb();
  let mergedNursesCount = 0;
  let deletedDupNursesCount = 0;
  let deduplicatedTrainingsCount = 0;
  let deduplicatedCredentialsCount = 0;
  let cleanedAreasCount = 0;

  if (db) {
    // 0. Ensure Canonical Areas exist and consolidate non-standard areas (e.g. "DU MAIN NURSES" -> "RDU Main", "DU ANNEX NURSES" -> "RDU Annex")
    for (const ca of CANONICAL_AREAS) {
      await db.insert(areas).values({
        code: ca.code,
        name: ca.name,
        description: ca.description,
        sortOrder: ca.sortOrder,
        active: true,
      }).onDuplicateKeyUpdate({
        set: {
          name: ca.name,
          description: ca.description,
          sortOrder: ca.sortOrder,
          active: true,
        },
      });
    }

    const allDbAreas = await db.select().from(areas);
    const canonicalByCode = new Map(
      allDbAreas
        .filter((a) => CANONICAL_AREAS.some((c) => c.code === a.code || c.name.toLowerCase() === a.name.toLowerCase()))
        .map((a) => [a.code, a])
    );
    const canonicalByName = new Map(
      allDbAreas
        .filter((a) => CANONICAL_AREAS.some((c) => c.code === a.code || c.name.toLowerCase() === a.name.toLowerCase()))
        .map((a) => [a.name.toLowerCase(), a])
    );

    for (const a of allDbAreas) {
      const canonicalMatch = canonicalAreaInfo(a.name) || canonicalAreaInfo(a.code);
      if (canonicalMatch) {
        const canonicalArea = canonicalByCode.get(canonicalMatch.code) ?? canonicalByName.get(canonicalMatch.name.toLowerCase());
        if (canonicalArea && canonicalArea.id !== a.id) {
          // Reassign nurses to the canonical area
          await db.update(nurses).set({ currentAreaId: canonicalArea.id }).where(eq(nurses.currentAreaId, a.id));
          await db.update(areaAssignments).set({ areaId: canonicalArea.id }).where(eq(areaAssignments.areaId, a.id));
          try {
            await db.update(areaTrainingRequirements).set({ areaId: canonicalArea.id }).where(eq(areaTrainingRequirements.areaId, a.id));
          } catch {
            // ignore duplicate requirement conflicts
          }
          await db.delete(areas).where(eq(areas.id, a.id));
          cleanedAreasCount++;
        }
      }
    }

    // 1. Fetch all nurses & credentials
    const allNurses = await db.select().from(nurses);
    const allCreds = await db.select().from(nurseCredentials);
    const credsByNurseId = new Map<number, typeof allCreds>();
    for (const c of allCreds) {
      if (!credsByNurseId.has(c.nurseId)) credsByNurseId.set(c.nurseId, []);
      credsByNurseId.get(c.nurseId)!.push(c);
    }

    const ds = new DisjointSet();
    const byEmpId = new Map<string, number>();
    const byTokenName = new Map<string, number>();
    const byShortName = new Map<string, number>();
    const byEmail = new Map<string, number>();
    const byLicNum = new Map<string, number>();

    for (const n of allNurses) {
      const nurseId = n.id;
      ds.find(nurseId);

      // Match by clean employeeId
      const empKey = cleanIdKey(n.employeeId);
      if (empKey.length >= 3) {
        if (byEmpId.has(empKey)) {
          ds.union(nurseId, byEmpId.get(empKey)!);
        } else {
          byEmpId.set(empKey, nurseId);
        }
      }

      // Match by full tokenized name (ignoring middle initials and case)
      const tokenKey = nameTokenKey(n.firstName, n.lastName, n.middleName);
      if (tokenKey.length > 3) {
        if (byTokenName.has(tokenKey)) {
          ds.union(nurseId, byTokenName.get(tokenKey)!);
        } else {
          byTokenName.set(tokenKey, nurseId);
        }
      }

      // Match by short name (first token of first name + last name)
      const sKey = shortNameKey(n.firstName, n.lastName);
      if (sKey.length > 4) {
        if (byShortName.has(sKey)) {
          ds.union(nurseId, byShortName.get(sKey)!);
        } else {
          byShortName.set(sKey, nurseId);
        }
      }

      // Match by email
      if (n.accountEmail && n.accountEmail.trim().length > 3) {
        const emKey = n.accountEmail.trim().toLowerCase();
        if (byEmail.has(emKey)) {
          ds.union(nurseId, byEmail.get(emKey)!);
        } else {
          byEmail.set(emKey, nurseId);
        }
      }

      // Match by license numbers in credentials
      const nurseCredList = credsByNurseId.get(nurseId) ?? [];
      for (const cred of nurseCredList) {
        const licKey = cleanIdKey(cred.licenseNumber);
        if (licKey.length >= 4) {
          if (byLicNum.has(licKey)) {
            ds.union(nurseId, byLicNum.get(licKey)!);
          } else {
            byLicNum.set(licKey, nurseId);
          }
        }
      }
    }

    // Group nurses by disjoint set root
    const clusters = new Map<number, Nurse[]>();
    for (const n of allNurses) {
      const root = ds.find(n.id);
      if (!clusters.has(root)) clusters.set(root, []);
      clusters.get(root)!.push(n);
    }

    // Process clusters
    const clusterEntries = Array.from(clusters.values());
    for (let i = 0; i < clusterEntries.length; i++) {
      const group = clusterEntries[i];
      if (group.length <= 1) continue;

      const score = (n: Nurse) => {
        let s = 0;
        if (n.linkedUserId) s += 1000;
        if (n.accountEmail) s += 200;
        if (n.position && n.position.toLowerCase() !== "nurse") s += 50;
        if (n.dateHired) s += 30;
        if (n.contactNumber) s += 20;
        if (n.middleName) s += 10;
        if (cleanIdKey(n.employeeId).length >= 5) s += 15;
        s -= n.id * 0.001;
        return s;
      };

      const sorted = [...group].sort((a, b) => score(b) - score(a));
      const primary = sorted[0];
      const duplicates = group.filter((n) => n.id !== primary.id);

      for (const dup of duplicates) {
        const updates: Record<string, unknown> = {};
        if (!primary.accountEmail && dup.accountEmail) updates.accountEmail = dup.accountEmail;
        if (!primary.currentAreaId && dup.currentAreaId) updates.currentAreaId = dup.currentAreaId;
        if (!primary.dateHired && dup.dateHired) updates.dateHired = dup.dateHired;
        if ((!primary.position || primary.position.toLowerCase() === "nurse") && dup.position) {
          updates.position = dup.position;
        }
        if (!primary.contactNumber && dup.contactNumber) updates.contactNumber = dup.contactNumber;
        if (!primary.middleName && dup.middleName) updates.middleName = dup.middleName;
        if (!primary.suffix && dup.suffix) updates.suffix = dup.suffix;

        const primEmpKey = cleanIdKey(primary.employeeId);
        const dupEmpKey = cleanIdKey(dup.employeeId);
        if (primEmpKey.length < dupEmpKey.length && dupEmpKey.length >= 4) {
          updates.employeeId = dup.employeeId;
        }

        if (Object.keys(updates).length > 0) {
          await db.update(nurses).set(updates).where(eq(nurses.id, primary.id));
        }

        await db.update(areaAssignments).set({ nurseId: primary.id }).where(eq(areaAssignments.nurseId, dup.id));
        await db.update(customCalendarEvents).set({ nurseId: primary.id }).where(eq(customCalendarEvents.nurseId, dup.id));
        await db.update(notifications).set({ nurseId: primary.id }).where(eq(notifications.nurseId, dup.id));

        const dupCreds = await db.select().from(nurseCredentials).where(eq(nurseCredentials.nurseId, dup.id));
        const primCreds = await db.select().from(nurseCredentials).where(eq(nurseCredentials.nurseId, primary.id));

        for (const dc of dupCreds) {
          const dcLicKey = cleanIdKey(dc.licenseNumber);
          const match = primCreds.find(
            (pc) => pc.credentialTypeId === dc.credentialTypeId || (dcLicKey && cleanIdKey(pc.licenseNumber) === dcLicKey)
          );

          if (match) {
            const dcExpiry = dc.expiryDate ? new Date(dc.expiryDate).getTime() : 0;
            const matchExpiry = match.expiryDate ? new Date(match.expiryDate).getTime() : 0;
            const credUpdates: Record<string, unknown> = {};

            if (dcExpiry > matchExpiry) {
              credUpdates.expiryDate = dc.expiryDate;
              credUpdates.renewalStatus = dc.renewalStatus;
              credUpdates.renewalCycleKey = dc.renewalCycleKey;
            }
            if (!match.licenseNumber && dc.licenseNumber) {
              credUpdates.licenseNumber = dc.licenseNumber;
            }
            if (Object.keys(credUpdates).length > 0) {
              await db.update(nurseCredentials).set(credUpdates).where(eq(nurseCredentials.id, match.id));
            }
            await db.delete(nurseCredentials).where(eq(nurseCredentials.id, dc.id));
            deduplicatedCredentialsCount++;
          } else {
            await db.update(nurseCredentials).set({ nurseId: primary.id }).where(eq(nurseCredentials.id, dc.id));
          }
        }

        const dupTrainings = await db.select().from(nurseTrainings).where(eq(nurseTrainings.nurseId, dup.id));
        const primTrainings = await db.select().from(nurseTrainings).where(eq(nurseTrainings.nurseId, primary.id));

        for (const dt of dupTrainings) {
          const dtDate = String(dt.completionDate ?? dt.scheduledDate ?? "").slice(0, 10);
          const exists = primTrainings.some(
            (pt) =>
              pt.trainingId === dt.trainingId &&
              String(pt.completionDate ?? pt.scheduledDate ?? "").slice(0, 10) === dtDate
          );
          if (exists) {
            await db.delete(nurseTrainings).where(eq(nurseTrainings.id, dt.id));
            deduplicatedTrainingsCount++;
          } else {
            await db.update(nurseTrainings).set({ nurseId: primary.id }).where(eq(nurseTrainings.id, dt.id));
          }
        }

        await db.delete(nurses).where(eq(nurses.id, dup.id));
        deletedDupNursesCount++;
      }
      mergedNursesCount++;
    }

    // 2. Global pass: Deduplicate duplicate nurseTrainings within individual nurses
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
    const ds = new DisjointSet();
    const byEmpId = new Map<string, number>();
    const byTokenName = new Map<string, number>();
    const byShortName = new Map<string, number>();

    for (const n of allNurses) {
      const nurseId = n.id;
      ds.find(nurseId);
      const empKey = cleanIdKey(n.employeeId);
      if (empKey.length >= 3) {
        if (byEmpId.has(empKey)) ds.union(nurseId, byEmpId.get(empKey)!);
        else byEmpId.set(empKey, nurseId);
      }
      const tokenKey = nameTokenKey(n.firstName, n.lastName, n.middleName);
      if (tokenKey.length > 3) {
        if (byTokenName.has(tokenKey)) ds.union(nurseId, byTokenName.get(tokenKey)!);
        else byTokenName.set(tokenKey, nurseId);
      }
      const sKey = shortNameKey(n.firstName, n.lastName);
      if (sKey.length > 4) {
        if (byShortName.has(sKey)) ds.union(nurseId, byShortName.get(sKey)!);
        else byShortName.set(sKey, nurseId);
      }
    }

    const clusters = new Map<number, any[]>();
    for (const n of allNurses) {
      const root = ds.find(n.id);
      if (!clusters.has(root)) clusters.set(root, []);
      clusters.get(root)!.push(n);
    }

    const clusterEntries = Array.from(clusters.values());
    for (let i = 0; i < clusterEntries.length; i++) {
      const group = clusterEntries[i];
      if (group.length <= 1) continue;
      const sorted = [...group].sort((a, b) => (b.linkedUserId ? 1 : 0) - (a.linkedUserId ? 1 : 0) || a.id - b.id);
      const primary = sorted[0];
      const duplicates = group.filter((n) => n.id !== primary.id);

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
    cleanedAreasCount,
  };
}
