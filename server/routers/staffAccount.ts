import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";
import { nurseFullName, sanitizeFilename, storageKey, validateMime } from "../../shared/nursetrack";
import { storagePut } from "../storage";

/**
 * Self-service for non-admin (staff) accounts: link a Google login to a
 * nurse record, then view/edit that record only. Every procedure here is
 * scoped to the caller's own linked nurse — never any other nurseId.
 */
export const staffAccountRouter = router({
  myLink: protectedProcedure.query(async ({ ctx }) => {
    const nurse = await db.getNurseByLinkedUserId(ctx.user.id);
    return { linked: Boolean(nurse), nurseId: nurse?.id ?? null };
  }),

  linkByPrc: protectedProcedure
    .input(z.object({ prcNumber: z.string().min(1).max(64), fullName: z.string().min(1).max(256) }))
    .mutation(async ({ ctx, input }) => {
      const existing = await db.getNurseByLinkedUserId(ctx.user.id);
      if (existing) throw new TRPCError({ code: "CONFLICT", message: "Your account is already linked to a staff profile." });

      const result = await db.linkNurseByPrcAndName(input.prcNumber, input.fullName, ctx.user.id);
      if (!result.ok) {
        if (result.reason === "already_linked") {
          throw new TRPCError({ code: "CONFLICT", message: "That staff profile is already linked to a different account." });
        }
        throw new TRPCError({ code: "NOT_FOUND", message: "No staff profile matches that PRC/license number and name. Check for typos or contact your supervisor." });
      }
      return { nurseId: result.nurse.id };
    }),

  myProfile: protectedProcedure.query(async ({ ctx }) => {
    const nurse = await db.getNurseByLinkedUserId(ctx.user.id);
    if (!nurse) throw new TRPCError({ code: "NOT_FOUND", message: "Your account isn't linked to a staff profile yet." });

    const [areaRows, types, catalog] = await Promise.all([
      db.listAreas(false),
      db.listCredentialTypes(true),
      db.listTrainingCatalog(true),
    ]);
    const areaById = new Map(areaRows.map((a) => [a.id, a]));
    const typeById = new Map(types.map((t) => [t.id, t.name]));
    const catalogById = new Map(catalog.map((c) => [c.id, c.name]));

    const { status, licenseNumber } = await db.getNurseLicenseInfo(nurse.id);
    const credentials = await db.listCredentials({ nurseId: nurse.id });
    const trainings = await db.listNurseTrainings({ nurseId: nurse.id });
    const assignments = await db.listAssignmentsForNurse(nurse.id);

    return {
      ...nurse,
      currentArea: nurse.currentAreaId ? areaById.get(nurse.currentAreaId) ?? null : null,
      licenseStatus: status,
      licenseNumber,
      credentials: credentials.map((c) => ({
        ...c,
        typeName: typeById.get(c.credentialTypeId) ?? "Credential / License",
      })),
      trainings: trainings.map((t) => ({
        ...t,
        trainingName: catalogById.get(t.trainingId) ?? "Training",
      })),
      assignments,
    };
  }),

  updateMyBasicInfo: protectedProcedure
    .input(z.object({ contactNumber: z.string().max(32).optional() }))
    .mutation(async ({ ctx, input }) => {
      const nurse = await db.getNurseByLinkedUserId(ctx.user.id);
      if (!nurse) throw new TRPCError({ code: "NOT_FOUND", message: "Your account isn't linked to a staff profile yet." });
      await db.updateNurse(nurse.id, { contactNumber: input.contactNumber ?? null });
      return { ok: true };
    }),

  uploadMyPhoto: protectedProcedure
    .input(z.object({ fileBase64: z.string(), fileName: z.string().max(200), mimeType: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const nurse = await db.getNurseByLinkedUserId(ctx.user.id);
      if (!nurse) throw new TRPCError({ code: "NOT_FOUND", message: "Your account isn't linked to a staff profile yet." });

      const mimeCheck = validateMime(input.mimeType, "photo");
      if (!mimeCheck.ok) throw new TRPCError({ code: "BAD_REQUEST", message: mimeCheck.error });
      const buffer = Buffer.from(input.fileBase64, "base64");
      if (buffer.length > 10 * 1024 * 1024) throw new TRPCError({ code: "BAD_REQUEST", message: "File too large (max 10 MB)." });

      const key = storageKey("profile-photos", nurse.id, sanitizeFilename(input.fileName));
      const { url } = await storagePut(key, buffer, input.mimeType);
      await db.updateNurse(nurse.id, { profilePhotoKey: key });
      await db.logActivity({
        supervisorId: ctx.user.id,
        nurseId: nurse.id,
        actionType: "nurse.photo.updated",
        entityType: "nurse",
        entityId: nurse.id,
        summary: `Profile photo updated by ${nurseFullName(nurse)} (self-service)`,
      });
      return { url };
    }),

  listCatalog: protectedProcedure.query(async () => {
    return db.listTrainingCatalog(false);
  }),

  uploadCredentialDocument: protectedProcedure
    .input(
      z.object({
        credentialId: z.number(),
        fileBase64: z.string(),
        fileName: z.string().max(200),
        mimeType: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const nurse = await db.getNurseByLinkedUserId(ctx.user.id);
      if (!nurse) throw new TRPCError({ code: "NOT_FOUND", message: "Your account isn't linked to a staff profile yet." });

      const allCreds = await db.listCredentials({ nurseId: nurse.id });
      const cred = allCreds.find((c) => c.id === input.credentialId);
      if (!cred) throw new TRPCError({ code: "NOT_FOUND", message: "Credential record not found on your profile." });

      const mimeCheck = validateMime(input.mimeType, "document");
      if (!mimeCheck.ok) throw new TRPCError({ code: "BAD_REQUEST", message: mimeCheck.error });
      const buffer = Buffer.from(input.fileBase64, "base64");
      if (buffer.length > 10 * 1024 * 1024) throw new TRPCError({ code: "BAD_REQUEST", message: "File too large (max 10 MB)." });

      const key = storageKey("license-documents", nurse.id, sanitizeFilename(input.fileName));
      const { url } = await storagePut(key, buffer, input.mimeType);
      await db.updateCredential(input.credentialId, { documentKey: key });
      await db.logActivity({
        supervisorId: ctx.user.id,
        nurseId: nurse.id,
        actionType: "license.document.uploaded",
        entityType: "credential",
        entityId: input.credentialId,
        summary: `License/credential document uploaded by ${nurseFullName(nurse)} (self-service)`,
      });
      return { url };
    }),

  addTrainingRecord: protectedProcedure
    .input(
      z.object({
        trainingId: z.number(),
        provider: z.string().max(128).optional(),
        completionDate: z.string().min(1),
        trainingHours: z.number().int().positive().optional(),
        cpdUnits: z.number().int().positive().optional(),
        certificateNumber: z.string().max(64).optional(),
        remarks: z.string().max(2000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const nurse = await db.getNurseByLinkedUserId(ctx.user.id);
      if (!nurse) throw new TRPCError({ code: "NOT_FOUND", message: "Your account isn't linked to a staff profile yet." });

      const id = await db.createNurseTraining({
        nurseId: nurse.id,
        trainingId: input.trainingId,
        provider: input.provider || undefined,
        status: "Completed",
        completionDate: new Date(input.completionDate),
        trainingHours: input.trainingHours || undefined,
        cpdUnits: input.cpdUnits || undefined,
        certificateNumber: input.certificateNumber || undefined,
        remarks: input.remarks || undefined,
      });

      await db.logActivity({
        supervisorId: ctx.user.id,
        nurseId: nurse.id,
        actionType: "training.created",
        entityType: "nurseTraining",
        entityId: id,
        summary: `Training completion submitted by ${nurseFullName(nurse)} (self-service)`,
      });

      return { id };
    }),

  uploadTrainingCertificate: protectedProcedure
    .input(
      z.object({
        recordId: z.number(),
        fileBase64: z.string(),
        fileName: z.string().max(200),
        mimeType: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const nurse = await db.getNurseByLinkedUserId(ctx.user.id);
      if (!nurse) throw new TRPCError({ code: "NOT_FOUND", message: "Your account isn't linked to a staff profile yet." });

      const trainings = await db.listNurseTrainings({ nurseId: nurse.id });
      const record = trainings.find((t) => t.id === input.recordId);
      if (!record) throw new TRPCError({ code: "NOT_FOUND", message: "Training record not found on your profile." });

      const mimeCheck = validateMime(input.mimeType, "document");
      if (!mimeCheck.ok) throw new TRPCError({ code: "BAD_REQUEST", message: mimeCheck.error });
      const buffer = Buffer.from(input.fileBase64, "base64");
      if (buffer.length > 10 * 1024 * 1024) throw new TRPCError({ code: "BAD_REQUEST", message: "File too large (max 10 MB)." });

      const key = storageKey("certificates", nurse.id, sanitizeFilename(input.fileName));
      const { url } = await storagePut(key, buffer, input.mimeType);
      await db.updateNurseTraining(input.recordId, { certificateKey: key });
      await db.logActivity({
        supervisorId: ctx.user.id,
        nurseId: nurse.id,
        actionType: "training.certificate.uploaded",
        entityType: "nurseTraining",
        entityId: input.recordId,
        summary: `Training certificate uploaded by ${nurseFullName(nurse)} (self-service)`,
      });
      return { url };
    }),
});
