import { asc, and, desc, eq, isNull, not, sql } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb, activeNurseCondition } from "../db";
import {
  activityLog,
  areaAssignments,
  areas,
  customCalendarEvents,
  nurses,
  nurseCredentials,
  nurseTrainings,
} from "../../drizzle/schema";
import { daysUntilExpiry, deriveLicenseStatus, todayDate, dateKey } from "../../shared/nursetrack";
import { getLocalDashboardInitial } from "../sqliteHelpers";

export const dashboardRouter = router({
  // Single round-trip initial load: merges the five section queries into one
  // network hop, which matters because each tRPC call costs ~seconds on the
  // hosting layer due to OAuth round-trips.
  initial: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) {
      return getLocalDashboardInitial();
    }
    const today = todayDate();

    // ---- shared source data ----
    // nurseCredentials/nurseTrainings joined with nurses once each, then reused
    // for summary counts, per-area attention, and action-center items below —
    // previously each of those three sections re-ran its own copy of these
    // joins (6 full-table joins per dashboard load instead of 2).
    const [activeRow] = await db
      .select({ count: sql<number>`count(*)` })
      .from(nurses)
      .where(activeNurseCondition());
    const activeNurses = Number(activeRow?.count ?? 0);

    const areaRows = await db.select().from(areas).orderBy(areas.sortOrder);
    const areaById = new Map(areaRows.map((a) => [a.id, a]));

    const nurseRows = await db
      .select({ id: nurses.id, firstName: nurses.firstName, lastName: nurses.lastName })
      .from(nurses)
      .where(isNull(nurses.archivedAt));
    const nurseById = new Map(nurseRows.map((n) => [n.id, n]));

    const credsJoined = await db
      .select({
        id: nurseCredentials.id,
        nurseId: nurseCredentials.nurseId,
        expiryDate: nurseCredentials.expiryDate,
        renewalStatus: nurseCredentials.renewalStatus,
        archivedAt: nurses.archivedAt,
        firstName: nurses.firstName,
        lastName: nurses.lastName,
        currentAreaId: nurses.currentAreaId,
      })
      .from(nurseCredentials)
      .innerJoin(nurses, eq(nurses.id, nurseCredentials.nurseId));

    const trainingsJoined = await db
      .select({
        id: nurseTrainings.id,
        nurseId: nurseTrainings.nurseId,
        status: nurseTrainings.status,
        scheduledDate: nurseTrainings.scheduledDate,
        expiryDate: nurseTrainings.expiryDate,
        archivedAt: nurses.archivedAt,
        firstName: nurses.firstName,
        lastName: nurses.lastName,
        currentAreaId: nurses.currentAreaId,
      })
      .from(nurseTrainings)
      .innerJoin(nurses, eq(nurses.id, nurseTrainings.nurseId));

    // ---- summary ----
    let within1Year = 0;
    let within6Months = 0;
    let expired = 0;
    for (const c of credsJoined) {
      if (c.archivedAt) continue;
      const status = deriveLicenseStatus(dateKey(c.expiryDate), today);
      if (status === "Within 1 Year") within1Year++;
      if (status === "Within 6 Months") within6Months++;
      if (status === "Expired") expired++;
    }
    let trainingsAttention = 0;
    for (const t of trainingsJoined) {
      if (t.archivedAt) continue;
      if (t.status === "Scheduled" && t.scheduledDate && dateKey(t.scheduledDate) <= today) trainingsAttention++;
      if (t.status === "Completed" && t.expiryDate && daysUntilExpiry(dateKey(t.expiryDate), today) <= 0) trainingsAttention++;
    }
    const summary = {
      activeNurses,
      licensesWithin1Year: within1Year,
      licensesWithin6Months: within6Months,
      licensesExpired: expired,
      trainingsAttention,
    };

    // ---- areaSnapshots ----
    const activeNurseCond = activeNurseCondition();
    const nurseCounts = await db
      .select({ areaId: nurses.currentAreaId, count: sql<number>`count(*)` })
      .from(nurses)
      .where(activeNurseCond)
      .groupBy(nurses.currentAreaId);
    const countByArea = new Map(nurseCounts.map((r) => [r.areaId ?? 0, Number(r.count)]));
    const photoNurses = await db
      .select({ currentAreaId: nurses.currentAreaId, id: nurses.id, profilePhotoKey: nurses.profilePhotoKey })
      .from(nurses)
      .where(activeNurseCond)
      .limit(300);
    const attentionByArea = new Map<number, number>();
    for (const c of credsJoined) {
      if (c.archivedAt) continue;
      const status = deriveLicenseStatus(dateKey(c.expiryDate), today);
      if (status !== "Valid" && c.currentAreaId) attentionByArea.set(c.currentAreaId, (attentionByArea.get(c.currentAreaId) ?? 0) + 1);
    }
    const trainingAttentionByArea = new Map<number, number>();
    for (const t of trainingsJoined) {
      if (t.archivedAt) continue;
      let needsAttention = false;
      if (t.status === "Scheduled" && t.scheduledDate && dateKey(t.scheduledDate) <= today) needsAttention = true;
      if (t.status === "Completed" && t.expiryDate && daysUntilExpiry(dateKey(t.expiryDate), today) <= 0) needsAttention = true;
      if (needsAttention && t.currentAreaId) trainingAttentionByArea.set(t.currentAreaId, (trainingAttentionByArea.get(t.currentAreaId) ?? 0) + 1);
    }
    const photosByArea = new Map<number, { id: number; profilePhotoKey: string }[]>();
    for (const n of photoNurses) {
      if (!n.currentAreaId || !n.profilePhotoKey) continue;
      const arr = photosByArea.get(n.currentAreaId) ?? [];
      if (arr.length < 6) arr.push({ id: n.id, profilePhotoKey: n.profilePhotoKey });
      photosByArea.set(n.currentAreaId, arr);
    }
    const areaSnapshots = areaRows.map((a) => ({
      ...a,
      nurseCount: countByArea.get(a.id) ?? 0,
      licenseAttention: attentionByArea.get(a.id) ?? 0,
      trainingAttention: trainingAttentionByArea.get(a.id) ?? 0,
      samplePhotos: photosByArea.get(a.id) ?? [],
    }));

    // ---- actionCenter ----
    interface ActionItem {
      kind: "license" | "training" | "transfer";
      severity: string;
      title: string;
      date: string;
      nurseId: number;
      nurseName: string;
      relatedEntityType?: string;
      relatedEntityId?: number;
    }
    const items: ActionItem[] = [];
    for (const c of credsJoined) {
      if (c.archivedAt) continue;
      const status = deriveLicenseStatus(dateKey(c.expiryDate), today);
      const days = daysUntilExpiry(dateKey(c.expiryDate), today);
      items.push({
        kind: "license",
        severity: status === "Expired" ? "urgent_or_expired" : status === "Within 6 Months" ? "upcoming_renewal" : "attention",
        title: `${c.firstName} ${c.lastName} — license ${status === "Expired" ? "expired" : `expires in ${days} days`} (${c.renewalStatus})`,
        date: dateKey(c.expiryDate),
        nurseId: c.nurseId,
        nurseName: `${c.firstName} ${c.lastName}`,
        relatedEntityType: "credential",
        relatedEntityId: c.id,
      });
    }
    for (const t of trainingsJoined) {
      if (t.archivedAt) continue;
      if (t.status === "Scheduled" && t.scheduledDate && dateKey(t.scheduledDate) <= today) {
        items.push({
          kind: "training",
          severity: "attention",
          title: `${t.firstName} ${t.lastName} — training overdue (was scheduled ${dateKey(t.scheduledDate)})`,
          date: dateKey(t.scheduledDate),
          nurseId: t.nurseId,
          nurseName: `${t.firstName} ${t.lastName}`,
          relatedEntityType: "nurseTraining",
          relatedEntityId: t.id,
        });
      }
      if (t.status === "Completed" && t.expiryDate && daysUntilExpiry(dateKey(t.expiryDate), today) <= 0) {
        items.push({
          kind: "training",
          severity: daysUntilExpiry(dateKey(t.expiryDate), today) < -30 ? "upcoming_renewal" : "attention",
          title: `${t.firstName} ${t.lastName} — training certification expired`,
          date: dateKey(t.expiryDate),
          nurseId: t.nurseId,
          nurseName: `${t.firstName} ${t.lastName}`,
          relatedEntityType: "nurseTraining",
          relatedEntityId: t.id,
        });
      }
    }
    const assignments = await db
      .select({
        id: areaAssignments.id,
        nurseId: areaAssignments.nurseId,
        startDate: areaAssignments.startDate,
        assignmentType: areaAssignments.assignmentType,
        areaId: areaAssignments.areaId,
        archivedAt: nurses.archivedAt,
        firstName: nurses.firstName,
        lastName: nurses.lastName,
      })
      .from(areaAssignments)
      .innerJoin(nurses, eq(nurses.id, areaAssignments.nurseId))
      .where(and(isNull(nurses.archivedAt), isNull(areaAssignments.endDate)));
    for (const a of assignments) {
      if (dateKey(a.startDate) > today) {
        items.push({
          kind: "transfer",
          severity: "informational",
          title: `${a.firstName} ${a.lastName} — transferring to ${areaById.get(a.areaId)?.name ?? "an area"} (${a.assignmentType ?? "transfer"})`,
          date: dateKey(a.startDate),
          nurseId: a.nurseId,
          nurseName: `${a.firstName} ${a.lastName}`,
          relatedEntityType: "areaAssignment",
          relatedEntityId: a.id,
        });
      }
    }
    items.sort((x, y) => {
      const sev = (s: string) => (s === "urgent_or_expired" ? 0 : s === "upcoming_renewal" ? 1 : s === "attention" ? 2 : 3);
      const cmp = sev(x.severity) - sev(y.severity);
      return cmp !== 0 ? cmp : x.date.localeCompare(y.date);
    });
    const now = new Date();
    const d30 = new Date(now.getTime() + 30 * 86400000).toISOString().slice(0, 10);
    const d180 = new Date(now.getTime() + 180 * 86400000).toISOString().slice(0, 10);
    const d365 = new Date(now.getTime() + 365 * 86400000).toISOString().slice(0, 10);
    const actionCenter = {
      urgent: items.filter((i) => i.severity === "urgent_or_expired" || (i.severity === "attention" && i.date <= today)),
      next30Days: items.filter((i) => i.date > today && i.date <= d30),
      next6Months: items.filter((i) => i.date > d30 && i.date <= d180),
      next1Year: items.filter((i) => i.date > d180 && i.date <= d365),
    };

    // ---- activityFeed ----
    const feedRows = await db.select().from(activityLog).orderBy(desc(activityLog.createdAt)).limit(20);
    const activityFeed = feedRows.map((r) => ({
      ...r,
      nurse: r.nurseId ? (nurseById.get(r.nurseId) ?? null) : null,
    }));

    // ---- upcoming ----
    const upcomingCustoms = await db
      .select({
        id: customCalendarEvents.id,
        title: customCalendarEvents.title,
        eventDate: customCalendarEvents.eventDate,
        nurseId: customCalendarEvents.nurseId,
        areaId: customCalendarEvents.areaId,
        nurseName: sql<string | null>`CONCAT(nurses.firstName, ' ', nurses.lastName)`,
        areaName: sql<string | null>`areas.name`,
      })
      .from(customCalendarEvents)
      .leftJoin(nurses, eq(nurses.id, customCalendarEvents.nurseId))
      .leftJoin(areas, eq(areas.id, customCalendarEvents.areaId))
      .where(sql`${customCalendarEvents.eventDate} >= ${today}`)
      .orderBy(asc(customCalendarEvents.eventDate))
      .limit(10);
    const upcomingLicenses = await db
      .select({
        id: nurseCredentials.id,
        nurseId: nurseCredentials.nurseId,
        expiryDate: nurseCredentials.expiryDate,
        nurseName: sql<string>`CONCAT(nurses.firstName, ' ', nurses.lastName)`,
        daysRemaining: sql<number>`DATEDIFF(${nurseCredentials.expiryDate}, CURDATE())`,
      })
      .from(nurseCredentials)
      .innerJoin(nurses, eq(nurses.id, nurseCredentials.nurseId))
      .where(and(isNull(nurses.archivedAt), sql`${nurseCredentials.expiryDate} >= CURDATE()`))
      .orderBy(asc(nurseCredentials.expiryDate))
      .limit(10);
    const upcoming = {
      upcomingCustoms: upcomingCustoms.map((r) => ({
        ...r,
        date: dateKey(r.eventDate),
        nurseName: r.nurseName ?? null,
        areaName: r.areaName ?? null,
      })),
      upcomingLicenses: upcomingLicenses.map((r) => ({
        ...r,
        date: dateKey(r.expiryDate),
        daysRemaining: Number(r.daysRemaining),
      })),
    };

    return { summary, actionCenter, areaSnapshots, activityFeed, upcoming };
  }),

  summary: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    const today = todayDate();

    const [activeRow] = await db
      .select({ count: sql<number>`count(*)` })
      .from(nurses)
      .where(activeNurseCondition());
    const activeNurses = Number(activeRow?.count ?? 0);

    const creds = await db
      .select({
        expiryDate: nurseCredentials.expiryDate,
        archivedAt: nurses.archivedAt,
      })
      .from(nurseCredentials)
      .innerJoin(nurses, eq(nurses.id, nurseCredentials.nurseId));
    let within1Year = 0;
    let within6Months = 0;
    let expired = 0;
    for (const c of creds) {
      if (c.archivedAt) continue;
      const status = deriveLicenseStatus(dateKey(c.expiryDate), today);
      if (status === "Within 1 Year") within1Year++;
      if (status === "Within 6 Months") within6Months++;
      if (status === "Expired") expired++;
    }

    const trainings = await db
      .select({
        status: nurseTrainings.status,
        scheduledDate: nurseTrainings.scheduledDate,
        expiryDate: nurseTrainings.expiryDate,
        archivedAt: nurses.archivedAt,
      })
      .from(nurseTrainings)
      .innerJoin(nurses, eq(nurses.id, nurseTrainings.nurseId));
    let trainingsAttention = 0;
    for (const t of trainings) {
      if (t.archivedAt) continue;
      if (t.status === "Scheduled" && t.scheduledDate && dateKey(t.scheduledDate) <= today) trainingsAttention++;
      if (t.status === "Completed" && t.expiryDate && daysUntilExpiry(dateKey(t.expiryDate), today) <= 0) trainingsAttention++;
    }

    return {
      activeNurses,
      licensesWithin1Year: within1Year,
      licensesWithin6Months: within6Months,
      licensesExpired: expired,
      trainingsAttention,
    };
  }),

  areaSnapshots: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    const today = todayDate();
    const areaRows = await db.select().from(areas).orderBy(areas.sortOrder);
    const activeNurseCond = activeNurseCondition();

    const nurseCounts = await db
      .select({ areaId: nurses.currentAreaId, count: sql<number>`count(*)` })
      .from(nurses)
      .where(activeNurseCond)
      .groupBy(nurses.currentAreaId);
    const countByArea = new Map(nurseCounts.map((r) => [r.areaId ?? 0, Number(r.count)]));

    const photoNurses = await db
      .select({ currentAreaId: nurses.currentAreaId, id: nurses.id, profilePhotoKey: nurses.profilePhotoKey })
      .from(nurses)
      .where(activeNurseCond)
      .limit(300);

    const creds = await db
      .select({ areaId: nurses.currentAreaId, expiryDate: nurseCredentials.expiryDate })
      .from(nurseCredentials)
      .innerJoin(nurses, eq(nurses.id, nurseCredentials.nurseId))
      .where(isNull(nurses.archivedAt));
    const attentionByArea = new Map<number, number>();
    for (const c of creds) {
      const status = deriveLicenseStatus(dateKey(c.expiryDate), today);
      if (status !== "Valid" && c.areaId) {
        attentionByArea.set(c.areaId, (attentionByArea.get(c.areaId) ?? 0) + 1);
      }
    }

    const trainings = await db
      .select({
        areaId: nurses.currentAreaId,
        status: nurseTrainings.status,
        scheduledDate: nurseTrainings.scheduledDate,
        expiryDate: nurseTrainings.expiryDate,
      })
      .from(nurseTrainings)
      .innerJoin(nurses, eq(nurses.id, nurseTrainings.nurseId))
      .where(isNull(nurses.archivedAt));
    const trainingAttentionByArea = new Map<number, number>();
    for (const t of trainings) {
      let needsAttention = false;
      if (t.status === "Scheduled" && t.scheduledDate && dateKey(t.scheduledDate) <= today) needsAttention = true;
      if (t.status === "Completed" && t.expiryDate && daysUntilExpiry(dateKey(t.expiryDate), today) <= 0) needsAttention = true;
      if (needsAttention && t.areaId) {
        trainingAttentionByArea.set(t.areaId, (trainingAttentionByArea.get(t.areaId) ?? 0) + 1);
      }
    }

    const photosByArea = new Map<number, { id: number; profilePhotoKey: string }[]>();
    for (const n of photoNurses) {
      if (!n.currentAreaId || !n.profilePhotoKey) continue;
      const arr = photosByArea.get(n.currentAreaId) ?? [];
      if (arr.length < 6) arr.push({ id: n.id, profilePhotoKey: n.profilePhotoKey });
      photosByArea.set(n.currentAreaId, arr);
    }

    return areaRows.map((a) => ({
      ...a,
      nurseCount: countByArea.get(a.id) ?? 0,
      licenseAttention: attentionByArea.get(a.id) ?? 0,
      trainingAttention: trainingAttentionByArea.get(a.id) ?? 0,
      samplePhotos: photosByArea.get(a.id) ?? [],
    }));
  }),

  actionCenter: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    const today = todayDate();

    interface Item {
      kind: "license" | "training" | "transfer";
      severity: string;
      title: string;
      date: string;
      nurseId: number;
      nurseName: string;
      relatedEntityType?: string;
      relatedEntityId?: number;
    }
    const items: Item[] = [];

    const nurseRows = await db
      .select({ id: nurses.id, firstName: nurses.firstName, lastName: nurses.lastName })
      .from(nurses)
      .where(isNull(nurses.archivedAt));
    const nurseById = new Map(nurseRows.map((n) => [n.id, n]));

    const creds = await db
      .select({
        id: nurseCredentials.id,
        nurseId: nurseCredentials.nurseId,
        expiryDate: nurseCredentials.expiryDate,
        renewalStatus: nurseCredentials.renewalStatus,
        archivedAt: nurses.archivedAt,
        firstName: nurses.firstName,
        lastName: nurses.lastName,
      })
      .from(nurseCredentials)
      .innerJoin(nurses, eq(nurses.id, nurseCredentials.nurseId));
    for (const c of creds) {
      if (c.archivedAt) continue;
      const status = deriveLicenseStatus(dateKey(c.expiryDate), today);
      const days = daysUntilExpiry(dateKey(c.expiryDate), today);
      items.push({
        kind: "license",
        severity: status === "Expired" ? "urgent_or_expired" : status === "Within 6 Months" ? "upcoming_renewal" : "attention",
        title: `${c.firstName} ${c.lastName} — license ${status === "Expired" ? "expired" : `expires in ${days} days`} (${c.renewalStatus})`,
        date: dateKey(c.expiryDate),
        nurseId: c.nurseId,
        nurseName: `${c.firstName} ${c.lastName}`,
        relatedEntityType: "credential",
        relatedEntityId: c.id,
      });
    }

    const trainings = await db
      .select({
        id: nurseTrainings.id,
        nurseId: nurseTrainings.nurseId,
        status: nurseTrainings.status,
        scheduledDate: nurseTrainings.scheduledDate,
        expiryDate: nurseTrainings.expiryDate,
        archivedAt: nurses.archivedAt,
        firstName: nurses.firstName,
        lastName: nurses.lastName,
      })
      .from(nurseTrainings)
      .innerJoin(nurses, eq(nurses.id, nurseTrainings.nurseId));
    for (const t of trainings) {
      if (t.archivedAt) continue;
      if (t.status === "Scheduled" && t.scheduledDate && dateKey(t.scheduledDate) <= today) {
        items.push({
          kind: "training",
          severity: "attention",
          title: `${t.firstName} ${t.lastName} — training overdue (was scheduled ${dateKey(t.scheduledDate)})`,
          date: dateKey(t.scheduledDate),
          nurseId: t.nurseId,
          nurseName: `${t.firstName} ${t.lastName}`,
          relatedEntityType: "nurseTraining",
          relatedEntityId: t.id,
        });
      }
      if (t.status === "Completed" && t.expiryDate && daysUntilExpiry(dateKey(t.expiryDate), today) <= 0) {
        items.push({
          kind: "training",
          severity: daysUntilExpiry(dateKey(t.expiryDate), today) < -30 ? "upcoming_renewal" : "attention",
          title: `${t.firstName} ${t.lastName} — training certification expired`,
          date: dateKey(t.expiryDate),
          nurseId: t.nurseId,
          nurseName: `${t.firstName} ${t.lastName}`,
          relatedEntityType: "nurseTraining",
          relatedEntityId: t.id,
        });
      }
    }

    const assignments = await db
      .select({
        id: areaAssignments.id,
        nurseId: areaAssignments.nurseId,
        startDate: areaAssignments.startDate,
        assignmentType: areaAssignments.assignmentType,
        areaId: areaAssignments.areaId,
        archivedAt: nurses.archivedAt,
        firstName: nurses.firstName,
        lastName: nurses.lastName,
      })
      .from(areaAssignments)
      .innerJoin(nurses, eq(nurses.id, areaAssignments.nurseId))
      .where(and(isNull(nurses.archivedAt), isNull(areaAssignments.endDate)));
    const areaRows = await db.select().from(areas);
    const areaById = new Map(areaRows.map((a) => [a.id, a]));
    for (const a of assignments) {
      if (dateKey(a.startDate) > today) {
        items.push({
          kind: "transfer",
          severity: "informational",
          title: `${a.firstName} ${a.lastName} — transferring to ${areaById.get(a.areaId)?.name ?? "an area"} (${a.assignmentType ?? "transfer"})`,
          date: dateKey(a.startDate),
          nurseId: a.nurseId,
          nurseName: `${a.firstName} ${a.lastName}`,
          relatedEntityType: "areaAssignment",
          relatedEntityId: a.id,
        });
      }
    }

    items.sort((x, y) => {
      const sev = (s: string) => (s === "urgent_or_expired" ? 0 : s === "upcoming_renewal" ? 1 : s === "attention" ? 2 : 3);
      const cmp = sev(x.severity) - sev(y.severity);
      return cmp !== 0 ? cmp : x.date.localeCompare(y.date);
    });

    const now = new Date();
    const d30 = new Date(now.getTime() + 30 * 86400000).toISOString().slice(0, 10);
    const d180 = new Date(now.getTime() + 180 * 86400000).toISOString().slice(0, 10);
    const d365 = new Date(now.getTime() + 365 * 86400000).toISOString().slice(0, 10);
    return {
      urgent: items.filter((i) => i.severity === "urgent_or_expired" || (i.severity === "attention" && i.date <= today)),
      next30Days: items.filter((i) => i.date > today && i.date <= d30),
      next6Months: items.filter((i) => i.date > d30 && i.date <= d180),
      next1Year: items.filter((i) => i.date > d180 && i.date <= d365),
    };
  }),

  activityFeed: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(100).optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const rows = await db
        .select()
        .from(activityLog)
        .orderBy(desc(activityLog.createdAt))
        .limit(input.limit ?? 50);
      const nurseRows = await db
        .select({ id: nurses.id, firstName: nurses.firstName, lastName: nurses.lastName })
        .from(nurses);
      const nurseById = new Map(nurseRows.map((n) => [n.id, n]));
      return rows.map((r) => ({
        ...r,
        nurse: r.nurseId ? (nurseById.get(r.nurseId) ?? null) : null,
      }));
    }),

  upcoming: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    const today = todayDate();

    const upcomingCustoms = await db
      .select({
        id: customCalendarEvents.id,
        title: customCalendarEvents.title,
        eventDate: customCalendarEvents.eventDate,
        nurseId: customCalendarEvents.nurseId,
        areaId: customCalendarEvents.areaId,
        nurseName: sql<string | null>`CONCAT(nurses.firstName, ' ', nurses.lastName)`,
        areaName: sql<string | null>`areas.name`,
      })
      .from(customCalendarEvents)
      .leftJoin(nurses, eq(nurses.id, customCalendarEvents.nurseId))
      .leftJoin(areas, eq(areas.id, customCalendarEvents.areaId))
      .where(sql`${customCalendarEvents.eventDate} >= ${today}`)
      .orderBy(asc(customCalendarEvents.eventDate))
      .limit(10);

    const upcomingLicenses = await db
      .select({
        id: nurseCredentials.id,
        nurseId: nurseCredentials.nurseId,
        expiryDate: nurseCredentials.expiryDate,
        nurseName: sql<string>`CONCAT(nurses.firstName, ' ', nurses.lastName)`,
        daysRemaining: sql<number>`DATEDIFF(${nurseCredentials.expiryDate}, CURDATE())`,
      })
      .from(nurseCredentials)
      .innerJoin(nurses, eq(nurses.id, nurseCredentials.nurseId))
      .where(and(isNull(nurses.archivedAt), sql`${nurseCredentials.expiryDate} >= CURDATE()`))
      .orderBy(asc(nurseCredentials.expiryDate))
      .limit(10);

    return {
      upcomingCustoms: upcomingCustoms.map((r) => ({
        ...r,
        date: dateKey(r.eventDate),
        nurseName: r.nurseName ?? null,
        areaName: r.areaName ?? null,
      })),
      upcomingLicenses: upcomingLicenses.map((r) => ({
        ...r,
        date: dateKey(r.expiryDate),
        daysRemaining: Number(r.daysRemaining),
      })),
    };
  }),
});
