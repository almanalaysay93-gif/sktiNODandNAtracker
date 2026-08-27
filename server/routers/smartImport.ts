import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import { adminProcedure, router } from "../_core/trpc";
import * as db from "../db";
import {
  EMPLOYMENT_STATUSES,
  MAX_FILE_BYTES,
  PARTICIPATION_ROLES,
  RENEWAL_STATUSES,
  STAFF_TYPES,
  TRAINING_STATUSES,
  VERIFICATION_STATUSES,
  nurseFullName,
  parseLocalDate,
  renewalCycleKey,
  sanitizeFilename,
  validateMime,
} from "../../shared/nursetrack";
import { REFERENCE_FIELDS, SMART_IMPORT_DRAFT_TTL_MS, SMART_IMPORT_KINDS, type SmartImportRow } from "../../shared/smartImport";
import { storagePut } from "../storage";
import { extractText } from "../_core/fileExtraction";
import { extractRecordsWithAi, type AiExtractedRow } from "../_core/aiExtraction";
import { resolveByName, resolveNurse } from "../_core/entityResolve";

const fieldValueSchema = z.object({
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]).nullable(),
  confidence: z.number(),
  refId: z.number().nullable().optional(),
});

const rowInputSchema = z.object({
  rowId: z.string(),
  kind: z.enum(SMART_IMPORT_KINDS),
  action: z.enum(["create", "update"]),
  nurseId: z.number().nullable(),
  nurseMatchConfidence: z.number(),
  nurseNameGuess: z.string(),
  fields: z.record(z.string(), fieldValueSchema),
  sourceExcerpt: z.string(),
  include: z.boolean(),
});

type Draft = {
  supervisorId: number;
  sourceDocumentKey: string;
  expiresAt: number;
};
const drafts = new Map<string, Draft>();

function sweepExpired() {
  const now = Date.now();
  for (const [id, d] of Array.from(drafts)) if (d.expiresAt < now) drafts.delete(id);
}

export const smartImportRouter = router({
  analyze: adminProcedure
    .input(z.object({ fileBase64: z.string(), fileName: z.string().max(200), mimeType: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const mimeCheck = validateMime(input.mimeType, "smartImport");
      if (!mimeCheck.ok) throw new TRPCError({ code: "BAD_REQUEST", message: mimeCheck.error });
      const buffer = Buffer.from(input.fileBase64, "base64");
      if (buffer.length > MAX_FILE_BYTES) throw new TRPCError({ code: "BAD_REQUEST", message: "File too large (max 10 MB)." });

      let extracted: { text: string };
      try {
        extracted = await extractText(buffer, input.mimeType, input.fileName);
      } catch (err) {
        throw new TRPCError({ code: "BAD_REQUEST", message: err instanceof Error ? err.message : "Could not read this file." });
      }

      const [nurses, areas, credentialTypes, trainingCatalog] = await Promise.all([
        db.listNurses(),
        db.listAreas(false),
        db.listCredentialTypes(false),
        db.listTrainingCatalog(false),
      ]);

      let aiRows: AiExtractedRow[];
      try {
        aiRows = await extractRecordsWithAi(extracted.text, {
          existingNurses: nurses.map((n) => ({ employeeId: n.employeeId, name: nurseFullName(n) })),
          existingAreas: areas.map((a) => a.name),
          existingCredentialTypes: credentialTypes.map((t) => t.name),
          existingTrainingCatalog: trainingCatalog.map((t) => t.name),
        });
      } catch (err) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: err instanceof Error ? err.message : "AI extraction failed." });
      }

      const rows: SmartImportRow[] = aiRows.map((r) => {
        const { nurseId, confidence: nurseMatchConfidence } = resolveNurse(r.nurseEmployeeIdGuess, r.nurseNameGuess, nurses);
        const fields: SmartImportRow["fields"] = {};
        for (const [key, fv] of Object.entries(r.fields)) {
          const refKind = REFERENCE_FIELDS[key];
          if (refKind && typeof fv.value === "string") {
            const list = refKind === "area" ? areas : refKind === "credentialType" ? credentialTypes : trainingCatalog;
            const { item, confidence: matchConfidence } = resolveByName(fv.value, list, (x) => x.name);
            fields[key] = { value: fv.value, confidence: Math.min(fv.confidence, item ? matchConfidence : 0.3), refId: item ? item.id : null };
          } else {
            fields[key] = { value: fv.value, confidence: fv.confidence };
          }
        }
        return {
          rowId: nanoid(10),
          kind: r.kind,
          action: r.kind === "nurse" && nurseId !== null ? "update" : "create",
          nurseId,
          nurseMatchConfidence,
          nurseNameGuess: r.nurseNameGuess ?? "",
          fields,
          sourceExcerpt: r.sourceExcerpt.slice(0, 200),
          include: true,
        };
      });

      // Keep the extraction result even if storage is unavailable — the AI read is the valuable, expensive
      // part; losing the source-file attachment is a fine degradation, losing the whole draft is not.
      let sourceDocumentKey = "";
      try {
        const key = `nursetrack/smart-import/${Date.now()}-${sanitizeFilename(input.fileName)}`;
        await storagePut(key, buffer, input.mimeType);
        sourceDocumentKey = key;
      } catch (err) {
        console.error("[SmartImport] source file storage failed, continuing without it:", err instanceof Error ? err.message : err);
      }

      const draftId = nanoid(16);
      sweepExpired();
      drafts.set(draftId, { supervisorId: ctx.user.id, sourceDocumentKey, expiresAt: Date.now() + SMART_IMPORT_DRAFT_TTL_MS });

      return { draftId, rows, fileName: input.fileName };
    }),

  commit: adminProcedure
    .input(z.object({ draftId: z.string(), rows: z.array(rowInputSchema) }))
    .mutation(async ({ ctx, input }) => {
      sweepExpired();
      const draft = drafts.get(input.draftId);
      if (!draft || draft.supervisorId !== ctx.user.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "This import session has expired. Please re-upload the file." });
      }

      let created = 0;
      let updated = 0;
      let skipped = 0;
      const errors: string[] = [];

      for (const row of input.rows) {
        if (!row.include) {
          skipped++;
          continue;
        }
        try {
          if (row.kind === "nurse") await commitNurse(row, ctx.user.id);
          else if (row.kind === "credential") await commitCredential(row, ctx.user.id, draft.sourceDocumentKey);
          else if (row.kind === "training") await commitTraining(row, ctx.user.id, draft.sourceDocumentKey);
          else if (row.kind === "areaAssignment") await commitAreaAssignment(row, ctx.user.id);
          else if (row.kind === "calendarEvent") await commitCalendarEvent(row, ctx.user.id);
          if (row.action === "update") updated++;
          else created++;
        } catch (err) {
          errors.push(`${row.kind} row (${row.nurseNameGuess || row.sourceExcerpt.slice(0, 40)}): ${err instanceof Error ? err.message : "failed"}`);
        }
      }

      drafts.delete(input.draftId);
      return { created, updated, skipped, errors };
    }),
});

type Row = z.infer<typeof rowInputSchema>;

function str(row: Row, key: string): string | undefined {
  const v = row.fields[key]?.value;
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}
function num(row: Row, key: string): number | undefined {
  const v = row.fields[key]?.value;
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() && !isNaN(Number(v))) return Number(v);
  return undefined;
}
function bool(row: Row, key: string): boolean | undefined {
  const v = row.fields[key]?.value;
  return typeof v === "boolean" ? v : undefined;
}
function dateVal(row: Row, key: string): Date | undefined {
  const v = str(row, key);
  if (!v || !/^\d{4}-\d{2}-\d{2}/.test(v)) return undefined;
  return parseLocalDate(v.slice(0, 10));
}
function refId(row: Row, key: string): number | null {
  return row.fields[key]?.refId ?? null;
}
function enumVal<T extends string>(row: Row, key: string, options: readonly T[]): T | undefined {
  const v = str(row, key);
  return v && (options as readonly string[]).includes(v) ? (v as T) : undefined;
}

async function commitNurse(row: Row, supervisorId: number) {
  const employeeId = str(row, "employeeId");
  const firstName = str(row, "firstName");
  const lastName = str(row, "lastName");
  const middleName = str(row, "middleName");
  const suffix = str(row, "suffix");
  const currentAreaId = refId(row, "areaName") ?? undefined;

  if (row.action === "update" && row.nurseId) {
    const existing = await db.getNurseById(row.nurseId);
    if (!existing) throw new Error("Nurse no longer exists.");
    await db.updateNurse(row.nurseId, {
      employeeId,
      firstName,
      lastName,
      middleName,
      suffix,
      position: str(row, "position"),
      contactNumber: str(row, "contactNumber"),
      staffType: enumVal(row, "staffType", STAFF_TYPES),
      dateHired: dateVal(row, "dateHired"),
      employmentStatus: enumVal(row, "employmentStatus", EMPLOYMENT_STATUSES),
      currentAreaId,
    });
    await db.logActivity({
      supervisorId,
      nurseId: row.nurseId,
      actionType: "smartImport.nurse.updated",
      entityType: "nurse",
      entityId: row.nurseId,
      summary: `Smart Import updated profile for ${nurseFullName(existing)}`,
    });
    return;
  }

  if (!employeeId || !firstName || !lastName) {
    throw new Error("Employee ID, first name and last name are required to create a nurse.");
  }
  const dupe = await db.getNurseByEmployeeId(employeeId);
  if (dupe) throw new Error(`Employee ID ${employeeId} already exists.`);
  const id = await db.createNurse({
    employeeId,
    firstName,
    lastName,
    middleName,
    suffix,
    position: str(row, "position"),
    contactNumber: str(row, "contactNumber"),
    staffType: enumVal(row, "staffType", STAFF_TYPES),
    dateHired: dateVal(row, "dateHired"),
    employmentStatus: enumVal(row, "employmentStatus", EMPLOYMENT_STATUSES) ?? "Active",
  });
  if (currentAreaId) {
    await db.updateNurse(id, { currentAreaId });
    await db.createAssignment({ nurseId: id, areaId: currentAreaId, startDate: new Date(), assignmentType: "Permanent Transfer", isCurrent: true });
  }
  await db.logActivity({
    supervisorId,
    nurseId: id,
    actionType: "smartImport.nurse.created",
    entityType: "nurse",
    entityId: id,
    summary: `Smart Import created nurse profile: ${nurseFullName({ firstName, middleName, lastName, suffix })}`,
  });
}

async function commitCredential(row: Row, supervisorId: number, documentKey: string) {
  if (!row.nurseId) throw new Error("No matching nurse selected.");
  const credentialTypeId = refId(row, "credentialTypeName");
  if (!credentialTypeId) throw new Error("No matching credential type selected.");
  const expiryDate = dateVal(row, "expiryDate");
  if (!expiryDate) throw new Error("Expiry date is required.");
  const nurse = await db.getNurseById(row.nurseId);
  if (!nurse) throw new Error("Nurse no longer exists.");

  const id = await db.createCredential({
    nurseId: row.nurseId,
    credentialTypeId,
    licenseNumber: str(row, "licenseNumber"),
    issuingOrganization: str(row, "issuingOrganization"),
    issueDate: dateVal(row, "issueDate"),
    expiryDate,
    renewalStatus: enumVal(row, "renewalStatus", RENEWAL_STATUSES) ?? "Not Started",
    verificationStatus: enumVal(row, "verificationStatus", VERIFICATION_STATUSES) ?? "Unverified",
    documentKey: documentKey || undefined,
    renewalCycleKey: renewalCycleKey(`smart-import-${Date.now()}`),
    remarks: str(row, "remarks"),
  });
  await db.logActivity({
    supervisorId,
    nurseId: row.nurseId,
    actionType: "smartImport.license.created",
    entityType: "credential",
    entityId: id,
    summary: `Smart Import added a license for ${nurseFullName(nurse)}`,
  });
}

async function commitTraining(row: Row, supervisorId: number, certificateKey: string) {
  if (!row.nurseId) throw new Error("No matching nurse selected.");
  const trainingId = refId(row, "trainingName");
  if (!trainingId) throw new Error("No matching training/seminar selected.");
  const nurse = await db.getNurseById(row.nurseId);
  if (!nurse) throw new Error("Nurse no longer exists.");
  const completionDate = dateVal(row, "completionDate");

  const id = await db.createNurseTraining({
    nurseId: row.nurseId,
    trainingId,
    participationRole: enumVal(row, "participationRole", PARTICIPATION_ROLES) ?? "Participant",
    provider: str(row, "provider"),
    status: enumVal(row, "status", TRAINING_STATUSES) ?? (completionDate ? "Completed" : "Scheduled"),
    scheduledDate: dateVal(row, "scheduledDate"),
    completionDate,
    expiryDate: dateVal(row, "expiryDate"),
    trainingHours: num(row, "trainingHours"),
    cpdUnits: num(row, "cpdUnits"),
    certificateNumber: str(row, "certificateNumber"),
    certificateKey: certificateKey || undefined,
    remarks: str(row, "remarks"),
  });
  await db.logActivity({
    supervisorId,
    nurseId: row.nurseId,
    actionType: "smartImport.training.created",
    entityType: "nurseTraining",
    entityId: id,
    summary: `Smart Import added a training record for ${nurseFullName(nurse)}`,
  });
}

async function commitAreaAssignment(row: Row, supervisorId: number) {
  if (!row.nurseId) throw new Error("No matching nurse selected.");
  const areaId = refId(row, "areaName");
  if (!areaId) throw new Error("No matching area selected.");
  const startDate = dateVal(row, "startDate");
  if (!startDate) throw new Error("Start date is required.");
  const nurse = await db.getNurseById(row.nurseId);
  if (!nurse) throw new Error("Nurse no longer exists.");

  await db.createAssignment({
    nurseId: row.nurseId,
    areaId,
    startDate,
    endDate: dateVal(row, "endDate"),
    assignmentType: str(row, "assignmentType"),
    remarks: str(row, "remarks"),
    isCurrent: false,
  });
  await db.logActivity({
    supervisorId,
    nurseId: row.nurseId,
    actionType: "smartImport.assignment.created",
    entityType: "areaAssignment",
    summary: `Smart Import backfilled an area assignment for ${nurseFullName(nurse)}`,
  });
}

async function commitCalendarEvent(row: Row, supervisorId: number) {
  const title = str(row, "title");
  const eventDate = dateVal(row, "eventDate");
  if (!title || !eventDate) throw new Error("Title and date are required.");

  const id = await db.createCustomEvent({
    title,
    eventDate,
    startTime: str(row, "startTime"),
    endTime: str(row, "endTime"),
    allDay: bool(row, "allDay") ?? true,
    nurseId: row.nurseId ?? undefined,
    areaId: refId(row, "areaName") ?? undefined,
    description: str(row, "description"),
  });
  await db.logActivity({
    supervisorId,
    nurseId: row.nurseId,
    actionType: "smartImport.calendarEvent.created",
    entityType: "customEvent",
    entityId: id,
    summary: `Smart Import created calendar event: ${title}`,
  });
}
