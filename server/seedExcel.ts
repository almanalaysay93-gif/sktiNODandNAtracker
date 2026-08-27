import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getDb } from "./db";
import {
  areas,
  credentialTypes,
  nurses,
  areaAssignments,
  nurseCredentials,
  trainingCatalog,
  trainingEvents,
  nurseTrainings,
  activityLog,
} from "../drizzle/schema";
import { eq, and } from "drizzle-orm";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseSafeDate(raw: any): Date | null {
  if (!raw) return null;
  if (raw instanceof Date && !isNaN(raw.getTime())) return raw;
  const s = String(raw).trim();
  if (!s || s === "null" || s === "undefined") return null;

  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s.slice(0, 10) + "T00:00:00");
    if (!isNaN(d.getTime())) return d;
  }
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (mdy) {
    const d = new Date(`${mdy[3]}-${mdy[1].padStart(2, "0")}-${mdy[2].padStart(2, "0")}T00:00:00`);
    if (!isNaN(d.getTime())) return d;
  }
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d;
  return null;
}

interface NameInfo {
  fullName: string;
  lastName: string;
  firstName: string;
  middleName?: string | null;
  suffix?: string | null;
}

interface StaffSeed {
  employeeId: string;
  nameInfo: NameInfo;
  email?: string | null;
  staffType: "Registered Nurse" | "Nursing Attendant";
  position: string;
  employmentStatus: "Active" | "Rotated" | "Resigned" | "Temporary Assignment" | "On Leave" | "Transferred" | "Retired" | "Archived";
  currentAreaCode: string;
  licenseNumber?: string | null;
  licenseExpiry?: string | null;
  historyNotes?: string;
  matrixTrainings?: Record<string, string>;
}

interface TrainingCatalogSeed {
  name: string;
  category: string;
  kind: "Training" | "Seminar" | "LDI";
  renewalRequired: boolean;
  defaultValidityMonths?: number | null;
}

interface AttendeeSeed {
  staffName: string;
  normName: string;
  employeeId: string;
  role: "Participant" | "Speaker" | "Facilitator" | "Preceptor";
  completionDate: string;
}

interface EventSeed {
  title: string;
  startDate: string;
  endDate: string;
  provider: string;
  venue: string;
  attendees: AttendeeSeed[];
}

interface SeedData {
  areas: Array<{ code: string; name: string; description: string; sortOrder: number }>;
  trainingCatalog: TrainingCatalogSeed[];
  staff: StaffSeed[];
  events: EventSeed[];
}

const catalogKey = (name: string) => name.slice(0, 128).trim().toLowerCase();

export async function seedExcelDatabase(dataFilePath?: string) {
  const jsonPath = dataFilePath ?? path.join(__dirname, "data", "seedData.json");
  if (!fs.existsSync(jsonPath)) {
    throw new Error(`Seed data file not found at ${jsonPath}.`);
  }

  const raw = fs.readFileSync(jsonPath, "utf-8");
  const data: SeedData = JSON.parse(raw);

  const db = await getDb();
  if (!db) {
    throw new Error("Database connection is not available. Please set DATABASE_URL.");
  }

  console.log(`[Seed] Starting seed with ${data.staff.length} staff, ${data.trainingCatalog.length} catalog items, ${data.events.length} events...`);

  // 1. Seed Credential Types
  console.log("[Seed] Ensuring Credential Types...");
  await db.insert(credentialTypes).values({
    name: "PRC Registered Nurse License",
    issuingOrganizationDefault: "Professional Regulation Commission (PRC)",
    active: true,
  }).onDuplicateKeyUpdate({ set: { active: true } });
  
  await db.insert(credentialTypes).values({
    name: "TESDA NC II / PRC Attendant Certification",
    issuingOrganizationDefault: "TESDA / DOH / SPMC",
    active: true,
  }).onDuplicateKeyUpdate({ set: { active: true } });

  const allCredTypes = await db.select().from(credentialTypes);
  const rnCredTypeId = allCredTypes.find((c) => c.name.includes("Nurse"))?.id ?? 1;
  const naCredTypeId = allCredTypes.find((c) => c.name.includes("TESDA") || c.name.includes("Attendant"))?.id ?? rnCredTypeId;

  // 2. Seed Areas
  console.log("[Seed] Seeding Areas...");
  for (const area of data.areas) {
    await db.insert(areas).values({
      code: area.code,
      name: area.name,
      description: area.description,
      sortOrder: area.sortOrder,
      active: true,
    }).onDuplicateKeyUpdate({
      set: {
        name: area.name,
        description: area.description,
        sortOrder: area.sortOrder,
        active: true,
      },
    });
  }
  const allAreas = await db.select().from(areas);
  const areaByCode = new Map(allAreas.map((a) => [a.code, a]));

  // 3. Seed Training Catalog
  console.log(`[Seed] Seeding ${data.trainingCatalog.length} Training Catalog items...`);
  const seenCatalogNames = new Set<string>();
  for (const item of data.trainingCatalog) {
    const safeName = item.name.slice(0, 128).trim();
    const key = catalogKey(item.name);
    if (seenCatalogNames.has(key)) continue;
    seenCatalogNames.add(key);
    await db.insert(trainingCatalog).values({
      name: safeName,
      category: item.category,
      kind: item.kind,
      renewalRequired: item.renewalRequired,
      defaultValidityMonths: item.defaultValidityMonths ?? null,
      active: true,
    }).onDuplicateKeyUpdate({
      set: {
        category: item.category,
        kind: item.kind,
        renewalRequired: item.renewalRequired,
        defaultValidityMonths: item.defaultValidityMonths ?? null,
        active: true,
      },
    });
  }
  const allCatalog = await db.select().from(trainingCatalog);
  const catalogByName = new Map(allCatalog.map((c) => [catalogKey(c.name), c]));

  // 4. Seed Staff (Nurses & Attendants)
  console.log(`[Seed] Seeding ${data.staff.length} staff members...`);
  const nurseIdByNormName = new Map<string, number>();
  const nurseIdByEmployeeId = new Map<string, number>();
  const allExistingNurses = await db.select().from(nurses);
  const nurseByName = new Map(
    allExistingNurses.map((n) => [`${n.lastName.trim()} ${n.firstName.trim()}`.toLowerCase().replace(/[^a-z0-9]/g, ""), n])
  );

  for (const person of data.staff) {
    const area = areaByCode.get(person.currentAreaCode) ?? allAreas[0];
    const nameKey = `${person.nameInfo.lastName.trim()} ${person.nameInfo.firstName.trim()}`.toLowerCase().replace(/[^a-z0-9]/g, "");
    const existing = (await db.select().from(nurses).where(eq(nurses.employeeId, person.employeeId)).limit(1))[0] ?? nurseByName.get(nameKey);
    
    let nurseId: number;
    if (existing) {
      nurseId = existing.id;
      await db.update(nurses).set({
        firstName: person.nameInfo.firstName || person.nameInfo.lastName,
        middleName: person.nameInfo.middleName ?? null,
        lastName: person.nameInfo.lastName,
        suffix: person.nameInfo.suffix ?? null,
        position: person.position,
        staffType: person.staffType,
        employmentStatus: person.employmentStatus,
        currentAreaId: area.id,
      }).where(eq(nurses.id, nurseId));
    } else {
      const res = await db.insert(nurses).values({
        employeeId: person.employeeId,
        firstName: person.nameInfo.firstName || person.nameInfo.lastName,
        middleName: person.nameInfo.middleName ?? null,
        lastName: person.nameInfo.lastName,
        suffix: person.nameInfo.suffix ?? null,
        position: person.position,
        staffType: person.staffType,
        employmentStatus: person.employmentStatus,
        currentAreaId: area.id,
      });
      nurseId = Number(res[0].insertId);
    }

    const normKey = `${person.nameInfo.lastName.toUpperCase()}, ${person.nameInfo.firstName.toUpperCase()}`;
    nurseIdByEmployeeId.set(person.employeeId, nurseId);
    nurseIdByNormName.set(normKey, nurseId);
    nurseIdByNormName.set(person.nameInfo.lastName.toUpperCase(), nurseId);

    // Ensure Current Assignment
    const asgns = await db.select().from(areaAssignments).where(eq(areaAssignments.nurseId, nurseId)).limit(1);
    if (asgns.length === 0) {
      await db.insert(areaAssignments).values({
        nurseId,
        areaId: area.id,
        startDate: new Date("2026-01-01T00:00:00"),
        assignmentType: person.employmentStatus === "Rotated" ? "Rotation" : "Permanent Transfer",
        remarks: person.historyNotes || "Imported from NN LDI Database Summary",
        isCurrent: person.employmentStatus === "Active",
      });
    }

    // Seed License / Credential if available
    const expiry = parseSafeDate(person.licenseExpiry);
    if (expiry) {
      const credTypeId = person.staffType === "Registered Nurse" ? rnCredTypeId : naCredTypeId;
      const cycleKey = `${nurseId}-${expiry.toISOString().slice(0, 10)}`;
      
      const existingCred = await db.select().from(nurseCredentials).where(
        and(eq(nurseCredentials.nurseId, nurseId), eq(nurseCredentials.credentialTypeId, credTypeId))
      ).limit(1);

      if (existingCred.length === 0) {
        await db.insert(nurseCredentials).values({
          nurseId,
          credentialTypeId: credTypeId,
          licenseNumber: person.licenseNumber ?? null,
          issuingOrganization: person.staffType === "Registered Nurse" ? "PRC" : "TESDA / SPMC",
          issueDate: new Date("2023-01-01T00:00:00"),
          expiryDate: expiry,
          renewalStatus: "Not Started",
          verificationStatus: "Verified",
          renewalCycleKey: cycleKey,
          remarks: person.historyNotes ?? null,
        });
      } else {
        await db.update(nurseCredentials).set({
          licenseNumber: person.licenseNumber ?? existingCred[0].licenseNumber,
          expiryDate: expiry,
          renewalCycleKey: cycleKey,
        }).where(eq(nurseCredentials.id, existingCred[0].id));
      }
    }
  }

  // 5. Seed Events and Attendances
  console.log(`[Seed] Seeding ${data.events.length} seminar events and attendances...`);
  let totalAttendances = 0;

  for (const ev of data.events) {
    const catalogItem = catalogByName.get(catalogKey(ev.title));
    if (!catalogItem) continue;

    const startDate = parseSafeDate(ev.startDate) || new Date("2026-03-15T00:00:00");
    const endDate = parseSafeDate(ev.endDate) || startDate;

    const existingEvents = await db.select().from(trainingEvents).where(
      and(
        eq(trainingEvents.trainingId, catalogItem.id),
        eq(trainingEvents.startDate, startDate)
      )
    ).limit(1);

    let eventId: number;
    if (existingEvents.length > 0) {
      eventId = existingEvents[0].id;
    } else {
      const eventRes = await db.insert(trainingEvents).values({
        trainingId: catalogItem.id,
        provider: ev.provider,
        venue: ev.venue,
        startDate,
        endDate,
        targetStaffType: "All",
        remarks: `Conducted by ${ev.provider}`,
      });
      eventId = Number(eventRes[0].insertId);
    }

    for (const att of ev.attendees) {
      const nurseId = nurseIdByEmployeeId.get(att.employeeId) ?? nurseIdByNormName.get(att.normName);
      if (!nurseId) {
        throw new Error(`Seed attendee did not resolve uniquely: ${att.staffName} (${att.employeeId})`);
      }

      const completionDate = parseSafeDate(att.completionDate) || startDate;

      const existingTrainings = await db.select().from(nurseTrainings).where(
        and(
          eq(nurseTrainings.nurseId, nurseId),
          eq(nurseTrainings.trainingId, catalogItem.id),
          eq(nurseTrainings.completionDate, completionDate)
        )
      ).limit(1);

      if (existingTrainings.length === 0) {
        try {
          await db.insert(nurseTrainings).values({
            nurseId,
            trainingId: catalogItem.id,
            eventId,
            status: "Completed",
            completionDate,
            scheduledDate: startDate,
            provider: ev.provider,
            participationRole: att.role,
            remarks: `Attended ${ev.title}`,
          });
          totalAttendances++;
        } catch {
          // Ignore duplicate attendance
        }
      }
    }
  }

  // Log activity
  await db.insert(activityLog).values({
    actionType: "system.seed.excel",
    summary: `Synchronized NN LDI Database Summary: ${data.staff.length} staff, ${data.trainingCatalog.length} catalog items, ${data.events.length} seminar events, ${totalAttendances} attendance records.`,
  });

  console.log(`[Seed] Complete! Seeded ${data.staff.length} staff, ${data.trainingCatalog.length} catalog items, ${data.events.length} events, and ${totalAttendances} attendances.`);
  return {
    staffCount: data.staff.length,
    catalogCount: data.trainingCatalog.length,
    eventCount: data.events.length,
    attendanceCount: totalAttendances,
  };
}

const entryPath = process.argv[1]?.replace(/\\/g, "/") ?? "";
const isDirectCliInvocation = /(^|\/)seedExcel(\.[cm]?[jt]s)?$/.test(entryPath);

if (isDirectCliInvocation) {
  seedExcelDatabase()
    .then((res) => {
      console.log("Success:", res);
      process.exit(0);
    })
    .catch((err) => {
      console.error("Error:", err);
      process.exit(1);
    });
}
