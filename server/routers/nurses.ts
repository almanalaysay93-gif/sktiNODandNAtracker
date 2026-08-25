import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";
import { ASSIGNMENT_TYPES, EMPLOYMENT_STATUSES, STAFF_TYPES, storageKey, validateMime, nurseFullName, dateKey } from "../../shared/nursetrack";
import { sanitizeFilename } from "../../shared/nursetrack";
import { storagePut } from "../storage";

const dateInput = z.union([z.date(), z.string().datetime()]).transform((d) => (d instanceof Date ? d : new Date(d)));
const nullableDateInput = z.union([z.date(), z.string().datetime(), z.null()]).transform((d) => (d === null ? null : d instanceof Date ? d : new Date(d))).optional();

export const nursesRouter = router({
  // Single round-trip initial load: nurses with areas in one call.
  initial: protectedProcedure.query(async () => {
    const [rows, areaRows] = await Promise.all([db.listNurses(), db.listAreas(false)]);
    const areaById = new Map(areaRows.map((a) => [a.id, a]));
    const nurses = await Promise.all(rows.map(async (n) => {
      const { status, licenseNumber } = await db.getNurseLicenseInfo(n.id);
      return {
        ...n,
        currentArea: n.currentAreaId ? areaById.get(n.currentAreaId) ?? null : null,
        licenseStatus: status,
        licenseNumber,
      };
    }));
    return { nurses, areas: areaRows };
  }),

  list: protectedProcedure
    .input(z.object({ archived: z.boolean().optional(), areaId: z.number().optional() }).optional())
    .query(async ({ input }) => {
      const rows = await db.listNurses({ archived: input?.archived, areaId: input?.areaId });
      const areaRows = await db.listAreas(false);
      const areaById = new Map(areaRows.map((a) => [a.id, a]));
      return Promise.all(rows.map(async (n) => {
        const { status, licenseNumber } = await db.getNurseLicenseInfo(n.id);
        return {
          ...n,
          currentArea: n.currentAreaId ? areaById.get(n.currentAreaId) ?? null : null,
          licenseStatus: status,
          licenseNumber,
        };
      }));
    }),

  search: protectedProcedure
    .input(z.object({ query: z.string().min(1).max(128) }))
    .query(async ({ input }) => {
      const rows = await db.searchNurses(input.query);
      const areaRows = await db.listAreas(false);
      const areaById = new Map(areaRows.map((a) => [a.id, a]));
      return Promise.all(rows.map(async (n) => {
        const { status, licenseNumber } = await db.getNurseLicenseInfo(n.id);
        return {
          ...n,
          currentArea: n.currentAreaId ? areaById.get(n.currentAreaId) ?? null : null,
          licenseStatus: status,
          licenseNumber,
        };
      }));
    }),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const nurse = await db.getNurseById(input.id);
      if (!nurse) throw new TRPCError({ code: "NOT_FOUND", message: "Nurse not found" });
      const areaRows = await db.listAreas(false);
      const areaById = new Map(areaRows.map((a) => [a.id, a]));
      const { status, licenseNumber } = await db.getNurseLicenseInfo(nurse.id);
      return { ...nurse, currentArea: nurse.currentAreaId ? areaById.get(nurse.currentAreaId) ?? null : null, licenseStatus: status, licenseNumber };
    }),

  create: protectedProcedure
    .input(
      z.object({
        employeeId: z.string().min(1).max(64),
        firstName: z.string().min(1).max(128),
        middleName: z.string().max(128).optional(),
        lastName: z.string().min(1).max(128),
        suffix: z.string().max(32).optional(),
        position: z.string().max(128).optional(),
        staffType: z.enum(STAFF_TYPES).optional(),
        dateHired: nullableDateInput,
        employmentStatus: z.enum([...EMPLOYMENT_STATUSES] as [string, ...string[]]),
        currentAreaId: z.number().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const byId = await db.getNurseByEmployeeId(input.employeeId);
      if (byId) throw new TRPCError({ code: "CONFLICT", message: "A nurse with this Employee ID already exists." });
      const id = await db.createNurse(input as Parameters<typeof db.createNurse>[0]);
      await db.updateNurse(id, { currentAreaId: input.currentAreaId ?? null });
      if (input.currentAreaId) {
        await db.createAssignment({
          nurseId: id,
          areaId: input.currentAreaId,
          startDate: new Date(),
          assignmentType: "Permanent Transfer",
          isCurrent: true,
        });
      }
      await db.logActivity({
        supervisorId: ctx.user.id,
        nurseId: id,
        actionType: "nurse.created",
        entityType: "nurse",
        entityId: id,
        summary: `Nurse profile created: ${nurseFullName(input)}`,
      });
      return { id };
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        employeeId: z.string().min(1).max(64).optional(),
        firstName: z.string().min(1).max(128).optional(),
        middleName: z.string().max(128).optional().nullable(),
        lastName: z.string().min(1).max(128).optional(),
        suffix: z.string().max(32).optional().nullable(),
        position: z.string().max(128).optional().nullable(),
        staffType: z.enum(STAFF_TYPES).optional(),
        dateHired: nullableDateInput,
        employmentStatus: z.enum([...EMPLOYMENT_STATUSES] as [string, ...string[]]).optional(),
        currentAreaId: z.number().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, employeeId, ...rest } = input;
      const nurse = await db.getNurseById(id);
      if (!nurse) throw new TRPCError({ code: "NOT_FOUND", message: "Nurse not found" });
      if (employeeId !== undefined && employeeId !== nurse.employeeId) {
        const taken = await db.getNurseByEmployeeId(employeeId);
        if (taken) throw new TRPCError({ code: "CONFLICT", message: "A nurse with this Employee ID already exists." });
      }
      await db.updateNurse(id, { ...rest, ...(employeeId ? { employeeId } : {}) } as Parameters<typeof db.updateNurse>[1]);
      await db.logActivity({
        supervisorId: ctx.user.id,
        nurseId: id,
        actionType: "nurse.updated",
        entityType: "nurse",
        entityId: id,
        summary: `Nurse profile updated: ${nurseFullName({ ...nurse, ...input })}`,
      });
      return { success: true } as const;
    }),

  archive: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const nurse = await db.getNurseById(input.id);
      if (!nurse) throw new TRPCError({ code: "NOT_FOUND", message: "Nurse not found" });
      if (nurse.archivedAt) throw new TRPCError({ code: "BAD_REQUEST", message: "Nurse is already archived." });
      await db.updateNurse(input.id, { archivedAt: new Date(), employmentStatus: "Archived" });
      await db.clearCurrentAssignmentsForNurse(input.id);
      await db.logActivity({
        supervisorId: ctx.user.id,
        nurseId: input.id,
        actionType: "nurse.archived",
        entityType: "nurse",
        entityId: input.id,
        summary: `Nurse archived: ${nurseFullName(nurse)}`,
      });
      return { success: true } as const;
    }),

  restore: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const nurse = await db.getNurseById(input.id);
      if (!nurse) throw new TRPCError({ code: "NOT_FOUND", message: "Nurse not found" });
      if (!nurse.archivedAt) throw new TRPCError({ code: "BAD_REQUEST", message: "Nurse is not archived." });
      await db.updateNurse(input.id, { archivedAt: null, employmentStatus: nurse.employmentStatus === "Archived" ? "Active" : nurse.employmentStatus });
      await db.logActivity({
        supervisorId: ctx.user.id,
        nurseId: input.id,
        actionType: "nurse.restored",
        entityType: "nurse",
        entityId: input.id,
        summary: `Nurse restored: ${nurseFullName(nurse)}`,
      });
      return { success: true } as const;
    }),

  uploadPhoto: protectedProcedure
    .input(
      z.object({
        nurseId: z.number(),
        fileBase64: z.string(),
        fileName: z.string().max(200),
        mimeType: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const nurse = await db.getNurseById(input.nurseId);
      if (!nurse) throw new TRPCError({ code: "NOT_FOUND", message: "Nurse not found" });
      const mimeCheck = validateMime(input.mimeType, "photo");
      if (!mimeCheck.ok) throw new TRPCError({ code: "BAD_REQUEST", message: mimeCheck.error });
      const buffer = Buffer.from(input.fileBase64, "base64");
      if (buffer.length > 10 * 1024 * 1024) throw new TRPCError({ code: "BAD_REQUEST", message: "File too large (max 10 MB)." });
      const key = storageKey("profile-photos", input.nurseId, sanitizeFilename(input.fileName));
      const { url } = await storagePut(key, buffer, input.mimeType);
      await db.updateNurse(input.nurseId, { profilePhotoKey: key });
      await db.logActivity({
        supervisorId: ctx.user.id,
        nurseId: input.nurseId,
        actionType: "nurse.photo.updated",
        entityType: "nurse",
        entityId: input.nurseId,
        summary: `Profile photo replaced for ${nurseFullName(nurse)}`,
      });
      return { url };
    }),

  getAssignments: protectedProcedure
    .input(z.object({ nurseId: z.number() }))
    .query(async ({ input }) => {
      const rows = await db.listAssignmentsForNurse(input.nurseId);
      const areaRows = await db.listAreas();
      const areaById = new Map(areaRows.map((a) => [a.id, a]));
      return rows.map((a) => ({ ...a, area: areaById.get(a.areaId) ?? null }));
    }),

  changeArea: protectedProcedure
    .input(
      z.object({
        nurseId: z.number(),
        newAreaId: z.number(),
        effectiveDate: z.date(),
        assignmentType: z.enum([...ASSIGNMENT_TYPES] as [string, ...string[]]),
        remarks: z.string().max(1000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const nurse = await db.getNurseById(input.nurseId);
      if (!nurse) throw new TRPCError({ code: "NOT_FOUND", message: "Nurse not found" });
      const assignments = await db.listAssignmentsForNurse(input.nurseId);
      const current = assignments.find((a) => a.isCurrent);
      if (!current) throw new TRPCError({ code: "BAD_REQUEST", message: "Nurse has no current assignment." });
      if (current.areaId === input.newAreaId) throw new TRPCError({ code: "BAD_REQUEST", message: "Nurse is already in that area." });

      // Use the effective date in local calendar days so timezone offsets do not
      // shift a same-day change into a future-dated one.
      const effective = new Date(
        input.effectiveDate.getFullYear(),
        input.effectiveDate.getMonth(),
        input.effectiveDate.getDate(),
      );
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Close current assignment the day before the effective date.
      await db.closeAssignment(current.id, new Date(effective.getTime() - 86400000));

      await db.createAssignment({
        nurseId: input.nurseId,
        areaId: input.newAreaId,
        startDate: effective,
        assignmentType: input.assignmentType as string,
        remarks: input.remarks ?? undefined,
        isCurrent: effective <= today,
      });
      if (effective <= today) {
        await db.updateNurse(input.nurseId, { currentAreaId: input.newAreaId });
      }

      const oldAreaName = current.areaId ? (await db.getAreaById(current.areaId))?.name : "Unassigned";
      const newAreaName = (await db.getAreaById(input.newAreaId))?.name ?? "Unknown";
      await db.logActivity({
        supervisorId: ctx.user.id,
        nurseId: input.nurseId,
        actionType: "nurse.area.changed",
        entityType: "areaAssignment",
        summary: `Area changed from ${oldAreaName} to ${newAreaName} effective ${effective.toLocaleDateString("en-CA")} (${input.assignmentType})`,
        metadata: {
          nurseId: input.nurseId,
          oldAreaId: current.areaId,
          newAreaId: input.newAreaId,
          effectiveDate: effective.toLocaleDateString("en-CA"),
          assignmentType: input.assignmentType,
        },
      });
      return { success: true } as const;
    }),

  backfillAssignment: protectedProcedure
    .input(
      z.object({
        nurseId: z.number(),
        areaId: z.number(),
        startDate: z.date(),
        endDate: nullableDateInput,
        assignmentType: z.enum([...ASSIGNMENT_TYPES] as [string, ...string[]]).optional(),
        remarks: z.string().max(1000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const nurse = await db.getNurseById(input.nurseId);
      if (!nurse) throw new TRPCError({ code: "NOT_FOUND", message: "Nurse not found" });
      await db.createAssignment({
        nurseId: input.nurseId,
        areaId: input.areaId,
        startDate: input.startDate,
        endDate: (input.endDate ?? undefined) as Date | undefined,
        assignmentType: input.assignmentType ?? undefined,
        remarks: input.remarks ?? undefined,
        isCurrent: false,
      });
      await db.logActivity({
        supervisorId: ctx.user.id,
        nurseId: input.nurseId,
        actionType: "nurse.assignment.backfilled",
        entityType: "areaAssignment",
        summary: `Historical assignment backfilled: ${input.assignmentType ?? "Other"} (${input.startDate.toISOString().slice(0, 10)})`,
      });
      return { success: true } as const;
    }),

  getEmployeeById: protectedProcedure
    .input(z.object({ employeeId: z.string().min(1).max(64) }))
    .query(async ({ input }) => {
      return await db.getNurseByEmployeeId(input.employeeId);
    }),
});
