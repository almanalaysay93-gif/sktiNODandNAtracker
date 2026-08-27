import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, eq, isNull, not, sql } from "drizzle-orm";
import { adminProcedure, router } from "../_core/trpc";
import { getDb, getAssignmentsForArea, listAreas, listNurses, listCredentials, getAreaById, getNurseLicenseInfo, activeNurseCondition } from "../db";
import { areas } from "../../drizzle/schema";
import { areaAssignments, nurses, nurseCredentials, nurseTrainings } from "../../drizzle/schema";
import { daysBetween, todayDate, deriveLicenseStatus, daysUntilExpiry, dateKey, INACTIVE_EMPLOYMENT_STATUSES } from "../../shared/nursetrack";

export const areasRouter = router({
  list: adminProcedure.query(() => listAreasWithCounts()),

  get: adminProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const rows = await db.select().from(areas).where(eq(areas.id, input.id)).limit(1);
      const area = rows[0];
      if (!area) throw new TRPCError({ code: "NOT_FOUND", message: "Area not found" });
      const staff = await Promise.all(
        (await getAssignmentsForArea(input.id)).map(async (s) => ({
          ...s,
          nurse: { ...s.nurse, licenseNumber: (await getNurseLicenseInfo(s.nurse.id)).licenseNumber },
        })),
      );
      return { ...area, staff };
    }),

  create: adminProcedure
    .input(
      z.object({
        code: z.string().min(1).max(64),
        name: z.string().min(1).max(128),
        description: z.string().max(2000).optional(),
        sortOrder: z.number().int().min(0).max(999).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const id = await db.insert(areas).values({
        code: input.code,
        name: input.name,
        description: input.description ?? null,
        sortOrder: input.sortOrder ?? 99,
        active: true,
      });
      return { id: id[0].insertId };
    }),

  update: adminProcedure
    .input(
      z.object({
        id: z.number(),
        code: z.string().min(1).max(64).optional(),
        name: z.string().min(1).max(128).optional(),
        description: z.string().max(2000).optional().nullable(),
        active: z.boolean().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const { id, ...rest } = input;
      const patch: Record<string, unknown> = {};
      if (rest.code !== undefined) patch.code = rest.code;
      if (rest.name !== undefined) patch.name = rest.name;
      if (rest.description !== undefined) patch.description = rest.description;
      if (rest.active !== undefined) patch.active = rest.active;
      await db.update(areas).set(patch).where(eq(areas.id, id));
      return { success: true } as const;
    }),

  deactivate: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const staff = await getAssignmentsForArea(input.id);
      if (staff.length > 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Area still has assigned nurses. Reassign them first." });
      }
      await db.update(areas).set({ active: false }).where(eq(areas.id, input.id));
      return { success: true } as const;
    }),

  areaDashboard: adminProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const today = todayDate();
      const area = await getAreaById(input.id);
      if (!area) throw new TRPCError({ code: "NOT_FOUND", message: "Area not found" });

      const staff = await getAssignmentsForArea(input.id);
      const nurseIds = staff.map((s: { nurse: { id: number } }) => s.nurse.id);

      const db = await getDb();
      if (!db) {
        const durations = staff
          .filter((s) => s.assignment.startDate)
          .map((s: { assignment: { startDate: Date | string } }) => daysBetween(dateKey(s.assignment.startDate), today));

        return {
          area,
          staffCount: staff.length,
          capacity: null,
          licenseAttention: 0,
          licensesExpired: 0,
          trainingAttention: 0,
          upcomingOutboundTransfers: [],
          avgDurationDays: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0,
        };
      }

      // Area-level license attention
      let licenseAttention = 0;
      let expired = 0;
      if (nurseIds.length > 0) {
        const creds = await db
          .select({ expiryDate: nurseCredentials.expiryDate })
          .from(nurseCredentials)
          .where(sql`${nurseCredentials.nurseId} IN (${sql.join(nurseIds, sql`, `)})`);
        for (const c of creds) {
          const status = deriveLicenseStatus(dateKey(c.expiryDate), today);
          if (status === "Expired") expired++;
          if (status !== "Valid") licenseAttention++;
        }
      }

      // Training attention
      let trainingAttention = 0;
      if (nurseIds.length > 0) {
        const trainings = await db
          .select({ status: nurseTrainings.status, scheduledDate: nurseTrainings.scheduledDate, expiryDate: nurseTrainings.expiryDate })
          .from(nurseTrainings)
          .where(sql`${nurseTrainings.nurseId} IN (${sql.join(nurseIds, sql`, `)})`);
        for (const t of trainings) {
          if (t.status === "Scheduled" && t.scheduledDate && dateKey(t.scheduledDate) <= today) trainingAttention++;
          if (t.status === "Completed" && t.expiryDate && daysUntilExpiry(dateKey(t.expiryDate), today) <= 0) trainingAttention++;
        }
      }

      // Upcoming transfers (outbound)
      const outbound = await db
        .select({
          nurse: { id: nurses.id, firstName: nurses.firstName, lastName: nurses.lastName },
          startDate: areaAssignments.startDate,
          assignmentType: areaAssignments.assignmentType,
        })
        .from(areaAssignments)
        .innerJoin(nurses, eq(nurses.id, areaAssignments.nurseId))
        .where(and(eq(areaAssignments.areaId, input.id), isNull(areaAssignments.endDate), sql`${areaAssignments.startDate} > ${today}`))
        .orderBy(sql`${areaAssignments.startDate} ASC`)
        .limit(10);

      // Assignment duration stats
      const durations = staff
        .filter((s) => s.assignment.startDate)
        .map((s: { assignment: { startDate: Date | string } }) => daysBetween(dateKey(s.assignment.startDate), today));

      return {
        area,
        staffCount: staff.length,
        capacity: null,
        licenseAttention,
        licensesExpired: expired,
        trainingAttention,
        upcomingOutboundTransfers: outbound.map((o) => ({
          nurse: { ...o.nurse, name: `${o.nurse.firstName} ${o.nurse.lastName}` },
          date: dateKey(o.startDate),
          type: o.assignmentType,
        })),
        avgDurationDays: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0,
      };
    }),
});

async function listAreasWithCounts() {
  const db = await getDb();
  if (!db) {
    const today = todayDate();
    const areaRows = await listAreas();
    const allNurses = await listNurses({ archived: false });
    const countByArea = new Map<number, number>();
    for (const n of allNurses) {
      if (n.currentAreaId && !(INACTIVE_EMPLOYMENT_STATUSES as readonly string[]).includes(n.employmentStatus)) {
        countByArea.set(n.currentAreaId, (countByArea.get(n.currentAreaId) ?? 0) + 1);
      }
    }
    const allCreds = await listCredentials();
    const nurseById = new Map(allNurses.map((n) => [n.id, n]));
    const attentionByArea = new Map<number, number>();
    for (const c of allCreds) {
      const nurse = nurseById.get(c.nurseId);
      if (nurse?.currentAreaId && deriveLicenseStatus(dateKey(c.expiryDate), today) !== "Valid") {
        attentionByArea.set(nurse.currentAreaId, (attentionByArea.get(nurse.currentAreaId) ?? 0) + 1);
      }
    }
    return areaRows.map((a) => ({
      ...a,
      nurseCount: countByArea.get(a.id) ?? 0,
      licenseAttention: attentionByArea.get(a.id) ?? 0,
    }));
  }
  const today = todayDate();
  const areaRows = await db.select().from(areas).orderBy(areas.sortOrder);
  const nurseCounts = await db
    .select({ areaId: nurses.currentAreaId, count: sql<number>`count(*)` })
    .from(nurses)
    .where(activeNurseCondition())
    .groupBy(nurses.currentAreaId);
  const countByArea = new Map(nurseCounts.map((r) => [r.areaId ?? 0, Number(r.count)]));
  const creds = await db
    .select({ areaId: nurses.currentAreaId, expiryDate: nurseCredentials.expiryDate })
    .from(nurseCredentials)
    .innerJoin(nurses, eq(nurses.id, nurseCredentials.nurseId))
    .where(isNull(nurses.archivedAt));
  const attentionByArea = new Map<number, number>();
  for (const c of creds) {
    if (deriveLicenseStatus(dateKey(c.expiryDate), today) !== "Valid" && c.areaId) {
      attentionByArea.set(c.areaId, (attentionByArea.get(c.areaId) ?? 0) + 1);
    }
  }
  return areaRows.map((a) => ({
    ...a,
    nurseCount: countByArea.get(a.id) ?? 0,
    licenseAttention: attentionByArea.get(a.id) ?? 0,
  }));
}
