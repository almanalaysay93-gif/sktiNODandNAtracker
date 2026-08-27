import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, isNull, sql } from "drizzle-orm";
import { adminProcedure, router } from "../_core/trpc";
import { getDb, getNurseByEmployeeId, createNurse, createAssignment, logActivity } from "../db";
import { areas, nurseCredentials, nurseTrainings, areaAssignments, appSettings, nurses } from "../../drizzle/schema";
import { EMPLOYMENT_STATUSES, nurseFullName } from "../../shared/nursetrack";
import { runDailyReminders } from "../reminders";
import { todayDate } from "../../shared/nursetrack";
import { seedExcelDatabase } from "../seedExcel";

const settingKey = z.enum([
  "appTitle",
  "reminderThresholdDays",
  "orgName",
  "contactEmail",
]);

export const settingsRouter = router({
  get: adminProcedure
    .input(z.object({ key: settingKey }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const rows = await db.select().from(appSettings).where(eq(appSettings.key, input.key)).limit(1);
      return { key: input.key, value: rows[0]?.value ?? null };
    }),

  getAll: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    const rows = await db.select().from(appSettings);
    const byKey = new Map(rows.map((r) => [r.key, r.value]));
    return {
      appTitle: byKey.get("appTitle") ?? "SKTI NurseTrack",
      reminderThresholdDays: byKey.get("reminderThresholdDays") ?? "365,180",
      orgName: byKey.get("orgName") ?? "",
      contactEmail: byKey.get("contactEmail") ?? "",
    };
  }),

  update: adminProcedure
    .input(z.object({ key: settingKey, value: z.string().max(5000).nullable() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      if (input.key === "reminderThresholdDays") {
        const nums = input.value
          ? input.value
              .split(",")
              .map((s) => Number(s.trim()))
              .filter((n) => Number.isInteger(n) && n > 0 && n <= 365)
          : [];
        if (nums.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Thresholds must be positive integers up to 365, separated by commas (e.g. 365,180)." });
        await db.update(appSettings).set({ value: nums.join(",") }).where(eq(appSettings.key, "reminderThresholdDays"));
      } else {
        await db.update(appSettings).set({ value: input.value }).where(eq(appSettings.key, input.key));
      }
      return { success: true } as const;
    }),

  runRemindersNow: adminProcedure.mutation(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    const rows = await db.select().from(appSettings).where(eq(appSettings.key, "reminderThresholdDays"));
    const raw = rows[0]?.value ?? "365,180";
    const thresholds = raw
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isInteger(n) && n > 0);
    const results = await runDailyReminders(todayDate(), thresholds.length ? thresholds : [365, 180]);
    return results;
  }),

  syncExcelDatabase: adminProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    const results = await seedExcelDatabase();
    await logActivity({
      supervisorId: ctx.user.id,
      actionType: "settings.excel.sync",
      summary: `Synced NN LDI Database: ${results.staffCount} staff, ${results.catalogCount} training catalog items, ${results.eventCount} seminar events, ${results.attendanceCount} attendances.`,
    });
    return results;
  }),

  previewCsvImport: adminProcedure
    .input(z.object({ csv: z.string().max(500000) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const rows = parseCsv(input.csv);
      if (rows.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "CSV is empty or has no valid rows." });
      const header = rows[0];
      const expected = ["employeeId", "firstName", "middleName", "lastName", "suffix", "position", "dateHired", "currentArea"];
      const missing = expected.filter((col) => !header.includes(col));
      if (missing.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Missing columns: ${missing.join(", ")}. Required: ${expected.join(", ")}.`,
        });
      }
      const areaRows = await db.select().from(areas).where(eq(areas.active, true));
      const areaByName = new Map(areaRows.map((a) => [a.name.toLowerCase(), a]));

      const issues: string[] = [];
      const preview: { row: number; employeeId: string; name: string; valid: boolean; note?: string }[] = [];
      const dataRows = rows.slice(1);
      const seenIds = new Set<string>();

      for (let i = 0; i < dataRows.length; i++) {
        const r = dataRows[i];
        if (!r.length) continue;
        const byCol = header.map((h, idx) => [h, (r[idx] ?? "").trim()] as const);
        const get = (col: string) => byCol.find(([h]) => h === col)?.[1] ?? "";
        const employeeId = get("employeeId");
        const firstName = get("firstName");
        const lastName = get("lastName");
        const suffix = get("suffix");
        if (!employeeId || !firstName || !lastName) {
          preview.push({ row: i + 2, employeeId, name: `${firstName} ${lastName}`, valid: false, note: "Missing required name/ID fields." });
          issues.push(`Row ${i + 2}: missing required fields.`);
          continue;
        }
        if (seenIds.has(employeeId)) {
          preview.push({ row: i + 2, employeeId, name: nurseFullName({ firstName, middleName: get("middleName"), lastName, suffix }), valid: false, note: "Duplicate Employee ID within file." });
          issues.push(`Row ${i + 2}: duplicate Employee ID.`);
          continue;
        }
        const existing = await getNurseByEmployeeId(employeeId);
        if (existing) {
          preview.push({ row: i + 2, employeeId, name: nurseFullName({ firstName, middleName: get("middleName"), lastName, suffix }), valid: false, note: "Employee ID already exists." });
          issues.push(`Row ${i + 2}: Employee ID already exists.`);
          continue;
        }
        seenIds.add(employeeId);
        const areaName = get("currentArea");
        const area = areaByName.get(areaName.toLowerCase());
        if (!area) {
          preview.push({ row: i + 2, employeeId, name: nurseFullName({ firstName, middleName: get("middleName"), lastName, suffix }), valid: false, note: `Area "${areaName}" not found.` });
          issues.push(`Row ${i + 2}: area "${areaName}" not found.`);
          continue;
        }
        preview.push({ row: i + 2, employeeId, name: nurseFullName({ firstName, middleName: get("middleName"), lastName, suffix }), valid: true, note: `→ ${area.name}` });
      }
      return { totalRows: dataRows.length, validRows: preview.filter((p) => p.valid).length, issues: issues.slice(0, 50), preview: preview.slice(0, 200) };
    }),

  executeCsvImport: adminProcedure
    .input(z.object({ csv: z.string().max(500000), skipInvalid: z.boolean().optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const rows = parseCsv(input.csv);
      if (rows.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "CSV is empty." });
      const header = rows[0];
      const get = (r: string[], col: string) => {
        const idx = header.indexOf(col);
        return idx >= 0 ? (r[idx] ?? "").trim() : "";
      };
      const areaRows = await db.select().from(areas).where(eq(areas.active, true));
      const areaByName = new Map(areaRows.map((a) => [a.name.toLowerCase(), a]));

      const results = { imported: 0, skipped: 0, errors: [] as string[] };
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        if (!r || !r.length) continue;
        const employeeId = get(r, "employeeId");
        const firstName = get(r, "firstName");
        const lastName = get(r, "lastName");
        if (!employeeId || !firstName || !lastName) { results.skipped++; continue; }
        if (await getNurseByEmployeeId(employeeId)) { results.skipped++; continue; }
        const area = areaByName.get(get(r, "currentArea").toLowerCase());
        if (!area) { results.skipped++; continue; }
        const id = await createNurse({
          employeeId,
          firstName,
          middleName: get(r, "middleName") || null,
          lastName,
          suffix: get(r, "suffix") || null,
          position: get(r, "position") || null,
          dateHired: get(r, "dateHired") ? new Date(`${get(r, "dateHired")}T00:00:00`) : null,
          employmentStatus: "Active" as never,
          currentAreaId: area.id,
        });
        await createAssignment({ nurseId: id, areaId: area.id, startDate: new Date(), assignmentType: "Imported", isCurrent: true });
        results.imported++;
      }
      await logActivity({
        supervisorId: ctx.user.id,
        actionType: "settings.csv.import",
        entityType: "nurse",
        summary: `CSV import completed: ${results.imported} imported, ${results.skipped} skipped`,
      });
      return results;
    }),

  exportData: adminProcedure
    .input(z.object({ entity: z.enum(["nurses", "credentials", "trainings", "assignments", "all"]) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const out: Record<string, unknown[]> = {};

      const nurseRows = await db.select().from(nurses);
      if (input.entity === "nurses" || input.entity === "all") out.nurses = nurseRows;
      if (input.entity === "all") {
        const credRows = await db.select().from(nurseCredentials);
        const trainingRows = await db.select().from(nurseTrainings);
        const asgnRows = await db.select().from(areaAssignments);
        out.nurseCredentials = credRows;
        out.nurseTrainings = trainingRows;
        out.areaAssignments = asgnRows;
      }
      return out;
    }),
});

function parseCsv(text: string): string[][] {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter((l) => l.trim().length > 0);
  return lines.map((line) => {
    const cells: string[] = [];
    let cell = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (i + 1 < line.length && line[i + 1] === '"') { cell += '"'; i++; } else { inQuotes = false; }
        } else { cell += ch; }
      } else if (ch === '"') { inQuotes = true; }
      else if (ch === ",") { cells.push(cell.trim()); cell = ""; }
      else { cell += ch; }
    }
    cells.push(cell.trim());
    return cells;
  });
}

