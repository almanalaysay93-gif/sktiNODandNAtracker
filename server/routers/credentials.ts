import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";
import { deriveLicenseStatus, LICENSE_STATUS_META, nurseFullName, renewalCycleKey, sanitizeFilename, storageKey, validateMime, dateKey } from "../../shared/nursetrack";
import { storagePut } from "../storage";

const nullableDateInput = z.union([z.date(), z.string().datetime(), z.null()]).transform((d) => (d === null ? null : d instanceof Date ? d : new Date(d))).optional();

export const credentialsRouter = router({
  listTypes: protectedProcedure.query(() => db.listCredentialTypes()),

  createType: protectedProcedure
    .input(z.object({ name: z.string().min(1).max(128), issuingOrganizationDefault: z.string().max(200).optional() }))
    .mutation(async ({ input }) => {
      const id = await db.createCredentialType(input.name, input.issuingOrganizationDefault);
      return { id };
    }),

  updateType: protectedProcedure
    .input(z.object({ id: z.number(), name: z.string().min(1).max(128).optional(), issuingOrganizationDefault: z.string().max(200).optional().nullable(), active: z.boolean().optional() }))
    .mutation(async ({ input }) => {
      await db.updateCredentialType(input.id, { ...input, issuingOrganizationDefault: input.issuingOrganizationDefault ?? undefined });
      return { success: true } as const;
    }),

  // Single round-trip initial load merging credentials + nurses + types
  // (the Licenses page previously fired three sequential network calls).
  initial: protectedProcedure.query(async () => {
    const [credentials, nurses, types] = await Promise.all([
      db.listCredentials(),
      db.listNurses(),
      db.listCredentialTypes(),
    ]);
    const nurseById = new Map(nurses.map((n) => [n.id, n]));
    const typeById = new Map(types.map((t) => [t.id, t]));
    return {
      credentials: credentials.map((c) => ({
        ...c,
        nurse: nurseById.get(c.nurseId),
        typeName: typeById.get(c.credentialTypeId)?.name ?? "Unknown",
        derivedStatus: deriveLicenseStatus(dateKey(c.expiryDate)),
        daysRemaining: Math.floor((parseForDays(c.expiryDate) - parseForDays(dateKey(new Date()))) / 86400000),
      })),
      nurses,
      types,
    };
  }),

  list: protectedProcedure.query(async () => {
    const rows = await db.listCredentials();
    const nurses = await db.listNurses();
    const nurseById = new Map(nurses.map((n) => [n.id, n]));
    const types = await db.listCredentialTypes();
    const typeById = new Map(types.map((t) => [t.id, t]));
    return rows.map((c) => {
      const nurse = nurseById.get(c.nurseId);
      const typeName = typeById.get(c.credentialTypeId)?.name ?? "Unknown";
      return {
        ...c,
        nurse,
        typeName,
        derivedStatus: deriveLicenseStatus(dateKey(c.expiryDate)),
        daysRemaining: Math.floor((parseForDays(c.expiryDate) - Date.now()) / 86400000),
      };
    });
  }),

  listForNurse: protectedProcedure
    .input(z.object({ nurseId: z.number() }))
    .query(async ({ input }) => {
      const rows = await db.listCredentials({ nurseId: input.nurseId });
      const types = await db.listCredentialTypes();
      const typeById = new Map(types.map((t) => [t.id, t]));
      return rows.map((c) => ({
        ...c,
        typeName: typeById.get(c.credentialTypeId)?.name ?? "Unknown",
        derivedStatus: deriveLicenseStatus(dateKey(c.expiryDate)),
        daysRemaining: Math.floor((parseForDays(c.expiryDate) - Date.now()) / 86400000),
      }));
    }),

  create: protectedProcedure
    .input(
      z.object({
        nurseId: z.number(),
        credentialTypeId: z.number(),
        licenseNumber: z.string().max(64).optional(),
        issuingOrganization: z.string().max(128).optional(),
        issueDate: nullableDateInput,
        expiryDate: z.date(),
        renewalStatus: z.enum(["Not Started", "Renewal In Progress", "Submitted", "Renewed"]).optional(),
        verificationStatus: z.enum(["Unverified", "Pending Verification", "Verified"]).optional(),
        documentKey: z.string().optional(),
        remarks: z.string().max(2000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const nurse = await db.getNurseById(input.nurseId);
      if (!nurse) throw new TRPCError({ code: "NOT_FOUND", message: "Nurse not found" });
      const id = await db.createCredential({
        ...input,
        renewalStatus: input.renewalStatus ?? "Not Started",
        verificationStatus: input.verificationStatus ?? "Unverified",
        renewalCycleKey: renewalCycleKey(`new-${Date.now()}`),
      });
      await db.logActivity({
        supervisorId: ctx.user.id,
        nurseId: input.nurseId,
        actionType: "license.created",
        entityType: "credential",
        entityId: id,
        summary: `License added for ${nurseFullName(nurse)} (expires ${dateKey(input.expiryDate)})`,
      });
      return { id };
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        licenseNumber: z.string().max(64).optional(),
        issuingOrganization: z.string().max(128).optional(),
        issueDate: nullableDateInput,
        expiryDate: z.date().optional(),
        renewalStatus: z.enum(["Not Started", "Renewal In Progress", "Submitted", "Renewed"]).optional(),
        verificationStatus: z.enum(["Unverified", "Pending Verification", "Verified"]).optional(),
        remarks: z.string().max(2000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input;
      const cred = (await db.listCredentials()).find((c) => c.id === id);
      if (!cred) throw new TRPCError({ code: "NOT_FOUND", message: "License not found" });
      const patch: Record<string, unknown> = {};
      if (rest.licenseNumber !== undefined) patch.licenseNumber = rest.licenseNumber;
      if (rest.issuingOrganization !== undefined) patch.issuingOrganization = rest.issuingOrganization;
      if (rest.issueDate !== undefined) patch.issueDate = rest.issueDate;
      if (rest.expiryDate !== undefined) {
        patch.expiryDate = rest.expiryDate;
        patch.renewalCycleKey = renewalCycleKey(`${id}-${rest.expiryDate.toISOString()}`);
      }
      if (rest.renewalStatus !== undefined) patch.renewalStatus = rest.renewalStatus;
      if (rest.verificationStatus !== undefined) patch.verificationStatus = rest.verificationStatus;
      if (rest.remarks !== undefined) patch.remarks = rest.remarks;
      await db.updateCredential(id, patch);
      const nurse = await db.getNurseById(cred.nurseId);
      await db.logActivity({
        supervisorId: ctx.user.id,
        nurseId: cred.nurseId,
        actionType: "license.updated",
        entityType: "credential",
        entityId: id,
        summary: nurse ? `License updated for ${nurseFullName(nurse)}` : `License #${id} updated`,
      });
      return { success: true } as const;
    }),

  uploadDocument: protectedProcedure
    .input(
      z.object({
        credentialId: z.number(),
        fileBase64: z.string(),
        fileName: z.string().max(200),
        mimeType: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const all = await db.listCredentials();
      const cred = all.find((c) => c.id === input.credentialId);
      if (!cred) throw new TRPCError({ code: "NOT_FOUND", message: "License not found" });
      const mimeCheck = validateMime(input.mimeType, "document");
      if (!mimeCheck.ok) throw new TRPCError({ code: "BAD_REQUEST", message: mimeCheck.error });
      const buffer = Buffer.from(input.fileBase64, "base64");
      if (buffer.length > 10 * 1024 * 1024) throw new TRPCError({ code: "BAD_REQUEST", message: "File too large (max 10 MB)." });
      const key = storageKey("license-documents", cred.nurseId, sanitizeFilename(input.fileName));
      const { url } = await storagePut(key, buffer, input.mimeType);
      await db.updateCredential(input.credentialId, { documentKey: key });
      await db.logActivity({
        supervisorId: ctx.user.id,
        nurseId: cred.nurseId,
        actionType: "license.document.uploaded",
        entityType: "credential",
        entityId: input.credentialId,
        summary: `License document uploaded for license #${input.credentialId}`,
      });
      return { url };
    }),

  markRenewed: protectedProcedure
    .input(
      z.object({
        credentialId: z.number(),
        newIssueDate: z.date(),
        newExpiryDate: z.date(),
        newLicenseNumber: z.string().max(64).optional(),
        newIssuingOrganization: z.string().max(128).optional(),
        documentKey: z.string().optional(),
        remarks: z.string().max(2000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const cred = (await db.listCredentials()).find((c) => c.id === input.credentialId);
      if (!cred) throw new TRPCError({ code: "NOT_FOUND", message: "License not found" });
      // Preserve the old record: mark it renewed and its reminders cycle as done.
      await db.updateCredential(input.credentialId, { renewalStatus: "Renewed" });
      await db.markReminderExpiredByCredential(input.credentialId);
      // Create a brand-new license record = new renewal cycle with its own reminder lifecycle.
      const nurse = await db.getNurseById(cred.nurseId);
      const newId = await db.createCredential({
        nurseId: cred.nurseId,
        credentialTypeId: cred.credentialTypeId,
        licenseNumber: input.newLicenseNumber ?? cred.licenseNumber ?? undefined,
        issuingOrganization: input.newIssuingOrganization ?? cred.issuingOrganization ?? undefined,
        issueDate: input.newIssueDate,
        expiryDate: input.newExpiryDate,
        renewalStatus: "Not Started",
        verificationStatus: cred.verificationStatus,
        documentKey: input.documentKey ?? undefined,
        renewalCycleKey: renewalCycleKey(`new-${Date.now()}`),
        remarks: input.remarks ?? undefined,
      });
      await db.logActivity({
        supervisorId: ctx.user.id,
        nurseId: cred.nurseId,
        actionType: "license.renewed",
        entityType: "credential",
        entityId: input.credentialId,
        summary: nurse
          ? `License renewed for ${nurseFullName(nurse)} — new cycle expiring ${dateKey(input.newExpiryDate)} (old record #${input.credentialId} preserved)`
          : `License renewed — new cycle #${newId}`,
      });
      return { id: newId } as const;
    }),
});

function parseForDays(expiry: Date | string): number {
  if (typeof expiry === "string") {
    const [y, m, d] = expiry.split("-").map(Number);
    return new Date(y, m - 1, d).getTime();
  }
  return expiry.getTime();
}

export { LICENSE_STATUS_META };
