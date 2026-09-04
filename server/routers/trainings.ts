import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { adminProcedure, router } from "../_core/trpc";
import * as db from "../db";
import {
  nurseFullName,
  PARTICIPATION_ROLES,
  sanitizeFilename,
  storageKey,
  trainingCompliance,
  validateMime,
  TRAINING_KINDS,
} from "../../shared/nursetrack";
import { storagePut } from "../storage";

const nullableDateInput = z.union([z.date(), z.string().datetime(), z.null()]).transform((d) => (d === null ? null : d instanceof Date ? d : new Date(d))).optional();

export const trainingsRouter = router({
  // Single round-trip initial load: catalog + records in one call (same enriched shape as listRecords).
  initial: adminProcedure.query(async () => {
    const [catalog, rows, nurses] = await Promise.all([db.listTrainingCatalog(true), db.listNurseTrainings(), db.listNurses()]);
    const nurseById = new Map(nurses.map((n) => [n.id, n]));
    const catById = new Map(catalog.map((t) => [t.id, t]));
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const records = rows.map((r) => {
      const nurse = nurseById.get(r.nurseId);
      const item = catById.get(r.trainingId);
      let derivedStatus = r.status;
      if (r.status === "Scheduled" && r.scheduledDate && new Date(r.scheduledDate) < today) derivedStatus = "Scheduled";
      if (r.status === "Completed" && r.expiryDate && new Date(r.expiryDate) < today) derivedStatus = "Expired";
      return { ...r, nurse, trainingName: item?.name ?? "Unknown", trainingItem: item ?? null, derivedStatus };
    });
    return { catalog, records };
  }),

  listCatalog: adminProcedure.query(() => db.listTrainingCatalog(true)),

  createCatalogItem: adminProcedure
    .input(
      z.object({
        name: z.string().min(1).max(128),
        category: z.string().max(64).optional(),
        kind: z.enum(TRAINING_KINDS).optional(),
        renewalRequired: z.boolean().optional(),
        defaultValidityMonths: z.number().int().positive().max(600).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const id = await db.createTrainingType(input);
      return { id };
    }),

  updateCatalogItem: adminProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).max(128).optional(),
        category: z.string().max(64).optional().nullable(),
        kind: z.enum(TRAINING_KINDS).optional(),
        renewalRequired: z.boolean().optional(),
        defaultValidityMonths: z.number().int().positive().max(600).optional().nullable(),
        active: z.boolean().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const { id, ...rest } = input;
      await db.updateTrainingType(id, {
        ...rest,
        category: rest.category ?? undefined,
        defaultValidityMonths: rest.defaultValidityMonths ?? undefined,
      });
      return { success: true } as const;
    }),

  listRecords: adminProcedure.query(async () => {
    const rows = await db.listNurseTrainings();
    const nurses = await db.listNurses();
    const nurseById = new Map(nurses.map((n) => [n.id, n]));
    const catalog = await db.listTrainingCatalog(true);
    const catById = new Map(catalog.map((t) => [t.id, t]));
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return rows.map((r) => {
      const nurse = nurseById.get(r.nurseId);
      const item = catById.get(r.trainingId);
      let derivedStatus = r.status;
      if (r.status === "Scheduled" && r.scheduledDate && new Date(r.scheduledDate) < today) derivedStatus = "Scheduled";
      if (r.status === "Completed" && r.expiryDate && new Date(r.expiryDate) < today) derivedStatus = "Expired";
      return { ...r, nurse, trainingName: item?.name ?? "Unknown", trainingItem: item ?? null, derivedStatus };
    });
  }),

  listForNurse: adminProcedure
    .input(z.object({ nurseId: z.number() }))
    .query(async ({ input }) => {
      const rows = await db.listNurseTrainings({ nurseId: input.nurseId });
      const catalog = await db.listTrainingCatalog(true);
      const catById = new Map(catalog.map((t) => [t.id, t]));
      return rows.map((r) => ({ ...r, trainingName: catById.get(r.trainingId)?.name ?? "Unknown" }));
    }),

  createRecord: adminProcedure
    .input(
      z.object({
        nurseId: z.number(),
        trainingId: z.number(),
        eventId: z.number().optional(),
        participationRole: z.enum(PARTICIPATION_ROLES).optional(),
        provider: z.string().max(128).optional(),
        status: z.enum(["Scheduled", "Completed", "Expired", "Cancelled"]).optional(),
        scheduledDate: nullableDateInput,
        completionDate: nullableDateInput,
        expiryDate: nullableDateInput,
        trainingHours: z.number().int().positive().optional(),
        cpdUnits: z.number().int().positive().optional(),
        certificateNumber: z.string().max(64).optional(),
        certificateKey: z.string().optional(),
        remarks: z.string().max(2000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const nurse = await db.getNurseById(input.nurseId);
      if (!nurse) throw new TRPCError({ code: "NOT_FOUND", message: "Nurse not found" });
      const id = await db.createNurseTraining({
        ...input,
        status: input.status ?? "Scheduled",
      });
      await db.logActivity({
        supervisorId: ctx.user.id,
        nurseId: input.nurseId,
        actionType: "training.created",
        entityType: "nurseTraining",
        entityId: id,
        summary: `Training record added for ${nurseFullName(nurse)}`,
      });
      return { id };
    }),

  updateRecord: adminProcedure
    .input(
      z.object({
        id: z.number(),
        status: z.enum(["Scheduled", "Completed", "Expired", "Cancelled"]).optional(),
        participationRole: z.enum(PARTICIPATION_ROLES).optional(),
        scheduledDate: nullableDateInput,
        completionDate: nullableDateInput,
        expiryDate: nullableDateInput,
        provider: z.string().max(128).optional(),
        trainingHours: z.number().int().positive().optional(),
        cpdUnits: z.number().int().positive().optional(),
        certificateNumber: z.string().max(64).optional(),
        remarks: z.string().max(2000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input;
      const rows = await db.listNurseTrainings();
      const record = rows.find((r) => r.id === id);
      if (!record) throw new TRPCError({ code: "NOT_FOUND", message: "Training record not found" });
      await db.updateNurseTraining(id, { ...rest });
      await db.logActivity({
        supervisorId: ctx.user.id,
        nurseId: record.nurseId,
        actionType: "training.updated",
        entityType: "nurseTraining",
        entityId: id,
        summary: `Training record #${id} updated`,
      });
      return { success: true } as const;
    }),

  deleteRecord: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const record = await db.deleteNurseTraining(input.id);
      if (!record) throw new TRPCError({ code: "NOT_FOUND", message: "Training record not found." });
      await db.logActivity({
        supervisorId: ctx.user.id,
        nurseId: record.nurseId,
        actionType: "training.deleted",
        entityType: "nurseTraining",
        entityId: input.id,
        summary: `Training record #${input.id} permanently deleted`,
      });
      return { success: true } as const;
    }),

  uploadCertificate: adminProcedure
    .input(
      z.object({
        recordId: z.number(),
        fileBase64: z.string(),
        fileName: z.string().max(200),
        mimeType: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const rows = await db.listNurseTrainings();
      const record = rows.find((r) => r.id === input.recordId);
      if (!record) throw new TRPCError({ code: "NOT_FOUND", message: "Training record not found" });
      const mimeCheck = validateMime(input.mimeType, "document");
      if (!mimeCheck.ok) throw new TRPCError({ code: "BAD_REQUEST", message: mimeCheck.error });
      const buffer = Buffer.from(input.fileBase64, "base64");
      if (buffer.length > 10 * 1024 * 1024) throw new TRPCError({ code: "BAD_REQUEST", message: "File too large (max 10 MB)." });
      const key = storageKey("certificates", record.nurseId, sanitizeFilename(input.fileName));
      const { url } = await storagePut(key, buffer, input.mimeType);
      await db.updateNurseTraining(input.recordId, { certificateKey: key });
      await db.logActivity({
        supervisorId: ctx.user.id,
        nurseId: record.nurseId,
        actionType: "training.certificate.uploaded",
        entityType: "nurseTraining",
        entityId: input.recordId,
        summary: `Certificate uploaded for training record #${input.recordId}`,
      });
      return { url };
    }),

  getAreaRequirements: adminProcedure
    .input(z.object({ areaId: z.number() }))
    .query(async ({ input }) => {
      return await db.getAreaTrainingRequirementIds(input.areaId);
    }),

  setAreaRequirement: adminProcedure
    .input(z.object({ areaId: z.number(), trainingId: z.number(), required: z.boolean() }))
    .mutation(async ({ input }) => {
      await db.setAreaTrainingRequirement(input.areaId, input.trainingId, input.required);
      return { success: true } as const;
    }),

  getCompliance: adminProcedure
    .input(z.object({ nurseId: z.number() }))
    .query(async ({ input }) => {
      const nurse = await db.getNurseById(input.nurseId);
      if (!nurse) throw new TRPCError({ code: "NOT_FOUND", message: "Nurse not found" });
      if (!nurse.currentAreaId) return { compliancePercent: 100, requiredCount: 0, completedCount: 0 };
      const requiredIds = await db.getAreaTrainingRequirementIds(nurse.currentAreaId);
      const records = await db.listNurseTrainings({ nurseId: input.nurseId });
      const compliance = trainingCompliance({
        requiredTrainingIds: requiredIds,
        nurseTrainingRecords: records.map((r) => ({
          trainingId: r.trainingId,
          status: r.status,
          expiryDate: r.expiryDate,
          completionDate: r.completionDate,
        })),
      });
      const completedValid = requiredIds.filter((tid) => {
        const recs = records.filter((r) => r.trainingId === tid && r.status === "Completed");
        return recs.some((r) => !r.expiryDate || new Date(r.expiryDate) > new Date());
      }).length;
      return { compliancePercent: compliance, requiredCount: requiredIds.length, completedCount: completedValid };
    }),
});
