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

    const areaRows = await db.listAreas(false);
    const areaById = new Map(areaRows.map((a) => [a.id, a]));
    const { status, licenseNumber } = await db.getNurseLicenseInfo(nurse.id);
    const credentials = await db.listCredentials({ nurseId: nurse.id });
    const trainings = await db.listNurseTrainings({ nurseId: nurse.id });
    const assignments = await db.listAssignmentsForNurse(nurse.id);

    return {
      ...nurse,
      currentArea: nurse.currentAreaId ? areaById.get(nurse.currentAreaId) ?? null : null,
      licenseStatus: status,
      licenseNumber,
      credentials,
      trainings,
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
});
