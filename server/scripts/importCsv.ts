import fs from "fs";
import path from "path";
import * as db from "../db";
import { dateKey } from "../../shared/nursetrack";
import { resolveNurse } from "../_core/entityResolve";

export interface ImportSummary {
  nursesCreated: number;
  nursesUpdated: number;
  trainingsCreated: number;
  trainingsSkipped: number;
  seminarsCreated: number;
  seminarAttendanceCreated: number;
  seminarAttendanceSkipped: number;
  errors: Array<{ file: string; row: number; message: string }>;
}

/**
 * Parse RFC 4180-ish CSV text. Quoted fields may contain commas, doubled quotes
 * and literal newlines, so the scan runs over the whole document rather than
 * line by line.
 */
export function parseCsv(content: string): Array<Record<string, string>> {
  const text = content.replace(/^﻿/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  const records: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cur.trim());
      cur = "";
    } else if (ch === "\n") {
      row.push(cur.trim());
      cur = "";
      records.push(row);
      row = [];
    } else {
      cur += ch;
    }
  }
  row.push(cur.trim());
  records.push(row);

  const populated = records.filter((r) => r.some((v) => v !== ""));
  if (!populated.length) return [];

  const headers = populated[0].map((h) => h.trim().toLowerCase());
  const rows: Array<Record<string, string>> = [];
  for (let i = 1; i < populated.length; i++) {
    const values = populated[i];
    const record: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      record[headers[j]] = values[j] !== undefined ? values[j] : "";
    }
    rows.push(record);
  }
  return rows;
}

/** Date columns are `mode: "date"` in Postgres, so every date must reach the driver as a Date. */
function toDate(value: string | null | undefined): Date | null {
  const key = dateKey(value ?? null);
  if (key) return new Date(`${key}T00:00:00Z`);
  const raw = (value ?? "").trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  return isNaN(parsed.getTime()) ? null : parsed;
}

/** trainingHours / cpdUnits are integer columns; spreadsheets often carry "8.0" or "7.5". */
function toInt(value: string | null | undefined): number | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function generateAreaCode(name: string, existingCodes: Set<string>): string {
  const words = name.replace(/[^a-zA-Z0-9\s]/g, "").trim().split(/\s+/);
  let baseCode = words.length > 1
    ? words.map((w) => w[0].toUpperCase()).join("").slice(0, 10)
    : name.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 8);
  if (!baseCode) baseCode = "AREA";

  let code = baseCode;
  let counter = 1;
  while (existingCodes.has(code)) {
    code = `${baseCode}${counter++}`;
  }
  existingCodes.add(code);
  return code;
}

export async function importFromCsvOutputs(outputsDir: string): Promise<ImportSummary> {
  const summary: ImportSummary = {
    nursesCreated: 0,
    nursesUpdated: 0,
    trainingsCreated: 0,
    trainingsSkipped: 0,
    seminarsCreated: 0,
    seminarAttendanceCreated: 0,
    seminarAttendanceSkipped: 0,
    errors: [],
  };

  const nursesDir = path.join(outputsDir, "nurses");
  const trainingsDir = path.join(outputsDir, "trainings");
  const seminarsDir = path.join(outputsDir, "seminars");

  // Cache existing reference entities
  let allAreas = await db.listAreas(true);
  const areaCodeSet = new Set(allAreas.map((a) => a.code.toUpperCase()));
  const areaNameMap = new Map(allAreas.map((a) => [a.name.toLowerCase(), a.id]));

  // The cache key carries the kind so a Seminar id is never handed back for a
  // Training of the same name.
  let allCatalog = await db.listTrainingCatalog(true);
  const catalogKey = (name: string, kind: string) => `${kind}::${name.trim().toLowerCase()}`;
  const catalogNameMap = new Map(allCatalog.map((c) => [catalogKey(c.name, c.kind), c.id]));

  async function getOrCreateArea(areaName: string): Promise<number | null> {
    const clean = areaName.trim();
    if (!clean) return null;
    const key = clean.toLowerCase();
    if (areaNameMap.has(key)) return areaNameMap.get(key)!;

    const code = generateAreaCode(clean, areaCodeSet);
    const newId = await db.createArea({
      code,
      name: clean,
      description: `Imported area: ${clean}`,
      sortOrder: 99,
      active: true,
    });
    areaNameMap.set(key, newId);
    return newId;
  }

  async function getOrCreateCatalogItem(name: string, kind: "Training" | "Seminar" | "LDI"): Promise<number> {
    const clean = name.trim();
    const key = catalogKey(clean, kind);
    if (catalogNameMap.has(key)) return catalogNameMap.get(key)!;

    const newId = await db.createTrainingType({
      name: clean,
      kind,
      category: "General",
      renewalRequired: false,
    });
    catalogNameMap.set(key, newId);
    return newId;
  }

  // 1. Ingest Nurses
  if (fs.existsSync(nursesDir)) {
    const nurseFiles = fs.readdirSync(nursesDir).filter((f) => f.endsWith(".csv"));
    for (const f of nurseFiles) {
      const fPath = path.join(nursesDir, f);
      const content = fs.readFileSync(fPath, "utf-8");
      const rows = parseCsv(content);

      for (let rIdx = 0; rIdx < rows.length; rIdx++) {
        const row = rows[rIdx];
        const empId = (row["employee_id"] || row["empid"] || "").trim();
        if (!empId) {
          summary.errors.push({ file: f, row: rIdx + 2, message: "Missing employee_id" });
          continue;
        }

        try {
          const areaName = row["area_name"] || "";
          const areaId = areaName ? await getOrCreateArea(areaName) : null;
          const staffType = (row["staff_type"]?.toLowerCase().includes("attendant") ? "Nursing Attendant" : "Registered Nurse") as any;
          const status = (row["employment_status"] || "Active") as any;
          const dateHired = toDate(row["date_hired"]);

          // Check if nurse exists
          const exactMatch = await db.getNurseByEmployeeId(empId);

          if (exactMatch) {
            await db.updateNurse(exactMatch.id, {
              firstName: row["first_name"] || exactMatch.firstName,
              middleName: row["middle_name"] || exactMatch.middleName,
              lastName: row["last_name"] || exactMatch.lastName,
              suffix: row["suffix"] || exactMatch.suffix,
              position: row["position"] || exactMatch.position,
              staffType,
              dateHired: (dateHired ?? exactMatch.dateHired) as any,
              employmentStatus: status,
              currentAreaId: areaId ?? exactMatch.currentAreaId,
              contactNumber: row["contact_number"] || exactMatch.contactNumber,
            });
            summary.nursesUpdated++;
          } else {
            const newNurseId = await db.createNurse({
              employeeId: empId,
              firstName: row["first_name"] || "Unknown",
              middleName: row["middle_name"] || null,
              lastName: row["last_name"] || "Staff",
              suffix: row["suffix"] || null,
              position: row["position"] || (staffType === "Nursing Attendant" ? "Nursing Attendant" : "Staff Nurse"),
              staffType,
              dateHired: dateHired ?? undefined,
              employmentStatus: status,
              currentAreaId: areaId ?? undefined,
              contactNumber: row["contact_number"] || null,
            });

            if (areaId) {
              await db.createAssignment({
                nurseId: newNurseId,
                areaId,
                isCurrent: true,
                startDate: dateHired ?? new Date().toISOString().slice(0, 10),
                assignmentType: "Primary",
              });
            }
            summary.nursesCreated++;
          }
        } catch (err: any) {
          summary.errors.push({ file: f, row: rIdx + 2, message: err.message || String(err) });
        }
      }
    }
  }

  // Refresh nurse cache for training resolutions
  const allNurses = await db.listNurses();

  // 2. Ingest Trainings
  if (fs.existsSync(trainingsDir)) {
    const trainingFiles = fs.readdirSync(trainingsDir).filter((f) => f.endsWith(".csv"));
    for (const f of trainingFiles) {
      const fPath = path.join(trainingsDir, f);
      const content = fs.readFileSync(fPath, "utf-8");
      const rows = parseCsv(content);

      for (let rIdx = 0; rIdx < rows.length; rIdx++) {
        const row = rows[rIdx];
        const tName = (row["training_name"] || row["training"] || "").trim();
        if (!tName) {
          summary.errors.push({ file: f, row: rIdx + 2, message: "Missing training_name" });
          continue;
        }

        try {
          // Resolve nurse
          const empIdGuess = (row["employee_id"] || "").trim();
          const nameGuess = (row["nurse_name"] || "").trim();
          const { nurseId } = resolveNurse(empIdGuess, nameGuess, allNurses);

          if (!nurseId) {
            summary.errors.push({ file: f, row: rIdx + 2, message: `Could not resolve nurse for "${empIdGuess}" / "${nameGuess}"` });
            continue;
          }

          const catalogId = await getOrCreateCatalogItem(tName, "Training");
          const completionDate = toDate(row["completion_date"]) ?? new Date();
          const role = (row["participation_role"] || "Participant") as any;
          const status = (row["status"] || "Completed") as any;

          // Re-running the importer over the same CSVs must not duplicate records.
          const existing = await db.findNurseTrainingByKey({ nurseId, trainingId: catalogId, completionDate });
          if (existing) {
            summary.trainingsSkipped++;
            continue;
          }

          await db.createNurseTraining({
            nurseId,
            trainingId: catalogId,
            participationRole: role,
            provider: row["provider"] || undefined,
            status,
            completionDate,
            scheduledDate: completionDate,
            trainingHours: toInt(row["training_hours"]),
            cpdUnits: toInt(row["cpd_units"]),
            certificateNumber: row["certificate_number"] || undefined,
            remarks: row["remarks"] || undefined,
          });

          summary.trainingsCreated++;
        } catch (err: any) {
          summary.errors.push({ file: f, row: rIdx + 2, message: err.message || String(err) });
        }
      }
    }
  }

  // 3. Ingest Seminars (the occurrence itself plus the attendance record on it)
  if (fs.existsSync(seminarsDir)) {
    const seminarFiles = fs.readdirSync(seminarsDir).filter((f) => f.endsWith(".csv"));
    for (const f of seminarFiles) {
      const fPath = path.join(seminarsDir, f);
      const content = fs.readFileSync(fPath, "utf-8");
      const rows = parseCsv(content);

      for (let rIdx = 0; rIdx < rows.length; rIdx++) {
        const row = rows[rIdx];
        const sTitle = (row["seminar_title"] || row["title"] || "").trim();
        if (!sTitle) {
          summary.errors.push({ file: f, row: rIdx + 2, message: "Missing seminar_title" });
          continue;
        }

        try {
          const empIdGuess = (row["employee_id"] || "").trim();
          const nameGuess = (row["nurse_name"] || "").trim();
          const { nurseId } = resolveNurse(empIdGuess, nameGuess, allNurses);

          if (!nurseId) {
            summary.errors.push({ file: f, row: rIdx + 2, message: `Could not resolve nurse for "${empIdGuess}" / "${nameGuess}"` });
            continue;
          }

          const catalogId = await getOrCreateCatalogItem(sTitle, "Seminar");
          const completionDate = toDate(row["completion_date"]) ?? toDate(row["start_date"]) ?? new Date();
          const startDate = toDate(row["start_date"]) ?? completionDate;
          const endDate = toDate(row["end_date"]) ?? startDate;
          const role = (row["participation_role"] || "Participant") as any;

          const event = await db.findOrCreateTrainingEvent({
            trainingId: catalogId,
            startDate,
            endDate,
            provider: row["provider"] || null,
            venue: row["venue"] || null,
          });
          if (event.created) summary.seminarsCreated++;

          const existing = await db.findNurseTrainingByKey({
            nurseId,
            trainingId: catalogId,
            eventId: event.id,
            completionDate,
          });
          if (existing) {
            summary.seminarAttendanceSkipped++;
            continue;
          }

          await db.createNurseTraining({
            nurseId,
            trainingId: catalogId,
            eventId: event.id,
            participationRole: role,
            provider: row["provider"] || undefined,
            status: "Completed",
            completionDate,
            scheduledDate: completionDate,
            remarks: row["venue"] ? `Venue: ${row["venue"]}` : undefined,
          });

          summary.seminarAttendanceCreated++;
        } catch (err: any) {
          summary.errors.push({ file: f, row: rIdx + 2, message: err.message || String(err) });
        }
      }
    }
  }

  // Record audit log
  await db.logActivity({
    actionType: "import_csv",
    entityType: "system",
    summary: `Imported ${summary.nursesCreated} nurses, ${summary.trainingsCreated} trainings, ${summary.seminarsCreated} seminar occurrences (${summary.seminarAttendanceCreated} attendees) from CSV`,
    metadata: {
      nursesCreated: summary.nursesCreated,
      nursesUpdated: summary.nursesUpdated,
      trainingsCreated: summary.trainingsCreated,
      trainingsSkipped: summary.trainingsSkipped,
      seminarsCreated: summary.seminarsCreated,
      seminarAttendanceCreated: summary.seminarAttendanceCreated,
      seminarAttendanceSkipped: summary.seminarAttendanceSkipped,
      errorCount: summary.errors.length,
    },
  });

  return summary;
}

// CLI entry point
if (process.argv[1] && (process.argv[1].endsWith("importCsv.ts") || process.argv[1].endsWith("importCsv.js"))) {
  const targetDir = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.resolve(process.cwd(), "data_import", "outputs");

  console.log(`[Import CSV] Loading normalized CSVs from: ${targetDir}`);
  importFromCsvOutputs(targetDir)
    .then((summary) => {
      console.log("\n=================================");
      console.log("       IMPORT CSV SUMMARY       ");
      console.log("=================================");
      console.log(`Nurses Created:      ${summary.nursesCreated}`);
      console.log(`Nurses Updated:      ${summary.nursesUpdated}`);
      console.log(`Trainings Created:   ${summary.trainingsCreated}`);
      console.log(`Trainings Skipped:   ${summary.trainingsSkipped}`);
      console.log(`Seminars Created:    ${summary.seminarsCreated}`);
      console.log(`Attendance Created:  ${summary.seminarAttendanceCreated}`);
      console.log(`Attendance Skipped:  ${summary.seminarAttendanceSkipped}`);
      console.log(`Errors:              ${summary.errors.length}`);
      if (summary.errors.length > 0) {
        console.log("\nErrors encountered:");
        for (const err of summary.errors) {
          console.log(`  - [${err.file}:${err.row}] ${err.message}`);
        }
      }
      console.log("=================================\n");
    })
    .catch((err) => {
      console.error("[Import CSV] Fatal error:", err);
      process.exit(1);
    });
}
