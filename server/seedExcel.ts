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

export async function seedExcelDatabase(dataFilePath?: string) {
  const jsonPath = dataFilePath ?? path.join(__dirname, "data", "seedData.json");
  if (!fs.existsSync(jsonPath)) {
    throw new Error(`Seed data file not found at ${jsonPath}. Run 'python scripts/parse_excel.py' first.`);
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

  // 3. Seed Training Catalog (case-insensitive dedup — source data has
  // mixed-case duplicates of the same training from different Excel sheets/years).
  console.log(`[Seed] Seeding ${data.trainingCatalog.length} Training Catalog items...`);
  const seenCatalogNames = new Set<string>();
  for (const item of data.trainingCatalog) {
    const key = item.name.trim().toLowerCase();
    if (seenCatalogNames.has(key)) continue;
    seenCatalogNames.add(key);
    await db.insert(trainingCatalog).values({
      name: item.name,
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
  const catalogByName = new Map(allCatalog.map((c) => [c.name.trim().toLowerCase(), c]));

  // 4. Seed Staff (Nurses & Attendants)
  console.log(`[Seed] Seeding ${data.staff.length} staff members...`);
  const nurseIdByNormName = new Map<string, number>();

  for (const person of data.staff) {
    const area = areaByCode.get(person.currentAreaCode) ?? allAreas[0];
    const existing = await db.select().from(nurses).where(eq(nurses.employeeId, person.employeeId)).limit(1);
    
    let nurseId: number;
    if (existing.length > 0) {
      nurseId = existing[0].id;
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
    if (person.licenseExpiry) {
      const credTypeId = person.staffType === "Registered Nurse" ? rnCredTypeId : naCredTypeId;
      const expiry = new Date(`${person.licenseExpiry}T00:00:00`);
      const cycleKey = `${nurseId}-${person.licenseExpiry}`;
      
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
    const catalogItem = catalogByName.get(ev.title.trim().toLowerCase());
    if (!catalogItem) continue;

    const startDate = new Date(`${ev.startDate}T00:00:00`);
    const endDate = new Date(`${ev.endDate}T00:00:00`);

    const eventRes = await db.insert(trainingEvents).values({
      trainingId: catalogItem.id,
      provider: ev.provider,
      venue: ev.venue,
      startDate,
      endDate,
      targetStaffType: "All",
      remarks: `Conducted by ${ev.provider}`,
    });
    const eventId = Number(eventRes[0].insertId);

    for (const att of ev.attendees) {
      let nurseId = nurseIdByNormName.get(att.normName);
      if (!nurseId) {
        const lastName = att.normName.split(",")[0].trim();
        nurseId = nurseIdByNormName.get(lastName);
      }
      if (!nurseId) continue;

      const completionDate = new Date(`${att.completionDate}T00:00:00`);

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
      } catch (err) {
        // Ignore duplicate attendance
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

// Only run when this file is invoked directly as a CLI script
// (e.g. `pnpm seed:excel` -> `tsx server/seedExcel.ts`).
//
// NOTE: do NOT use the usual `import.meta.url === file://${process.argv[1]}`
// check here. This module is imported by server/routers/settings.ts, so esbuild
// inlines it into the single-file production bundle (dist/index.js). Inside that
// bundle `import.meta.url` and `process.argv[1]` both resolve to dist/index.js,
// so the classic check evaluates to TRUE and the seeder runs on every server
// boot -- which then throws and kills the process. Matching on the entry
// filename keeps CLI usage working while staying inert inside the bundle.
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
