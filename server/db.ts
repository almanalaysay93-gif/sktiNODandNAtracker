import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, like, lte, not, or, sql, type SQL } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  activityLog,
  appSettings,
  areaAssignments,
  areaTrainingRequirements,
  areas,
  credentialTypes,
  customCalendarEvents,
  InsertArea,
  InsertNurse,
  InsertUser,
  licenseReminders,
  notifications,
  nurseCredentials,
  nurseTrainings,
  nurses,
  trainingCatalog,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }
  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  for (const field of textFields) {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }
  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

/* ---------------- Areas ---------------- */
export async function listAreas(includeInactive = true) {
  const db = await getDb();
  if (!db) return [];
  const q = includeInactive ? db.select().from(areas) : db.select().from(areas).where(eq(areas.active, true));
  const rows = await q.orderBy(asc(areas.sortOrder), asc(areas.name));
  return rows;
}

export async function createArea(data: InsertArea) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const result = await db.insert(areas).values(data);
  return result[0].insertId;
}

export async function updateArea(id: number, data: Partial<InsertArea>) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.update(areas).set(data).where(eq(areas.id, id));
}

export async function getAreaById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(areas).where(eq(areas.id, id)).limit(1);
  return rows[0];
}

/* ---------------- Nurses ---------------- */
export async function createNurse(data: InsertNurse) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const result = await db.insert(nurses).values(data);
  return result[0].insertId;
}

export async function updateNurse(id: number, data: Partial<InsertNurse>) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.update(nurses).set(data).where(eq(nurses.id, id));
}

export async function listNurses(opts: { archived?: boolean; areaId?: number; employmentStatus?: string } = {}) {
  const db = await getDb();
  if (!db) return [];
  const conds = [];
  if (opts.archived === false) conds.push(isNull(nurses.archivedAt));
  if (opts.archived === true) conds.push(isNotNull(nurses.archivedAt));
  if (opts.areaId !== undefined) conds.push(eq(nurses.currentAreaId, opts.areaId));
  if (opts.employmentStatus) conds.push(eq(nurses.employmentStatus, opts.employmentStatus as never));
  const q = conds.length ? db.select().from(nurses).where(and(...conds)) : db.select().from(nurses);
  return q.orderBy(asc(nurses.lastName), asc(nurses.firstName));
}

export async function getNurseByEmployeeId(employeeId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(nurses).where(eq(nurses.employeeId, employeeId)).limit(1);
  return rows[0];
}

export async function getNurseLicenseStatus(nurseId: number): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(nurseCredentials)
    .where(eq(nurseCredentials.nurseId, nurseId))
    .orderBy(desc(nurseCredentials.expiryDate))
    .limit(1);
  const cred = rows[0];
  if (!cred) return null;
  if (cred.renewalStatus === "Renewed") return "Valid";
  const days = Math.floor((parseLocalDate(cred.expiryDate).getTime() - parseLocalDate(todayDate()).getTime()) / 86400000);
  if (days < 0) return "Expired";
  if (days <= 180) return "Within 6 Months";
  if (days <= 365) return "Within 1 Year";
  return "Valid";
}

function parseLocalDate(value: string | Date): Date {
  if (value instanceof Date) return value;
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function todayDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function getNurseById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(nurses).where(eq(nurses.id, id)).limit(1);
  return rows[0];
}

export async function searchNurses(query: string) {
  const db = await getDb();
  if (!db) return [];
  const term = `%${query.trim()}%`;
  const rows = await db
    .select()
    .from(nurses)
    .where(and(isNull(nurses.archivedAt), or(like(nurses.firstName, term), like(nurses.middleName, term), like(nurses.lastName, term), like(nurses.employeeId, term))))
    .orderBy(asc(nurses.lastName), asc(nurses.firstName))
    .limit(10);
  return rows;
}

/* ---------------- Area assignments ---------------- */
export async function listAssignmentsForNurse(nurseId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(areaAssignments)
    .where(eq(areaAssignments.nurseId, nurseId))
    .orderBy(desc(areaAssignments.startDate));
}

export async function createAssignment(data: { nurseId: number; areaId: number; startDate: Date; endDate?: Date | null; assignmentType?: string; remarks?: string; isCurrent?: boolean }) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const result = await db.insert(areaAssignments).values(data);
  return result[0].insertId;
}

export async function closeAssignment(id: number, endDate: Date) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.update(areaAssignments).set({ endDate, isCurrent: false }).where(eq(areaAssignments.id, id));
}

export async function clearCurrentAssignmentsForNurse(nurseId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.update(areaAssignments).set({ isCurrent: false }).where(eq(areaAssignments.nurseId, nurseId));
}

export async function getAssignmentsForArea(areaId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      assignment: areaAssignments,
      nurse: nurses,
    })
    .from(areaAssignments)
    .innerJoin(nurses, eq(nurses.id, areaAssignments.nurseId))
    .where(and(eq(areaAssignments.areaId, areaId), eq(areaAssignments.isCurrent, true), isNull(nurses.archivedAt)));
}

/* ---------------- Credentials (licenses) ---------------- */
export async function listCredentials(opts: { nurseId?: number } = {}) {
  const db = await getDb();
  if (!db) return [];
  const q = opts.nurseId !== undefined
    ? db.select().from(nurseCredentials).where(eq(nurseCredentials.nurseId, opts.nurseId))
    : db.select().from(nurseCredentials);
  return q.orderBy(asc(nurseCredentials.expiryDate));
}

export async function createCredential(data: {
  nurseId: number; credentialTypeId: number; licenseNumber?: string; issuingOrganization?: string;
  issueDate?: Date | null; expiryDate: Date;   renewalStatus?: "Not Started" | "Renewal In Progress" | "Submitted" | "Renewed"; verificationStatus?: "Unverified" | "Pending Verification" | "Verified";
  documentKey?: string; renewalCycleKey: string; remarks?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const result = await db.insert(nurseCredentials).values(data);
  return result[0].insertId;
}

export async function updateCredential(id: number, data: Partial<typeof nurseCredentials.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.update(nurseCredentials).set(data).where(eq(nurseCredentials.id, id));
}

export async function listCredentialTypes(includeInactive = true) {
  const db = await getDb();
  if (!db) return [];
  const q = includeInactive ? db.select().from(credentialTypes) : db.select().from(credentialTypes).where(eq(credentialTypes.active, true));
  return q.orderBy(asc(credentialTypes.name));
}

export async function createCredentialType(name: string, issuingOrganizationDefault?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const result = await db.insert(credentialTypes).values({ name, issuingOrganizationDefault });
  return result[0].insertId;
}

export async function updateCredentialType(id: number, data: { name?: string; issuingOrganizationDefault?: string; active?: boolean }) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.update(credentialTypes).set(data).where(eq(credentialTypes.id, id));
}

/* ---------------- License reminders ---------------- */
export async function listReminders() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(licenseReminders).orderBy(desc(licenseReminders.generatedAt));
}

export async function createReminder(data: { credentialId: number; thresholdDays: number; renewalCycleKey: string; triggerDate: Date }): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const existing = await db
    .select({ id: licenseReminders.id })
    .from(licenseReminders)
    .where(
      and(
        eq(licenseReminders.credentialId, data.credentialId),
        eq(licenseReminders.thresholdDays, data.thresholdDays),
        eq(licenseReminders.renewalCycleKey, data.renewalCycleKey),
      ),
    )
    .limit(1);
  if (existing.length > 0) return existing[0].id;
  const result = await db.insert(licenseReminders).values(data);
  return result[0].insertId;
}

export async function acknowledgeReminder(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.update(licenseReminders).set({ acknowledgedAt: new Date(), status: "acknowledged" }).where(eq(licenseReminders.id, id));
}

export async function markReminderExpiredByCredential(credentialId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(licenseReminders).set({ status: "expired" }).where(eq(licenseReminders.credentialId, credentialId));
}

/* ---------------- Training ---------------- */
export async function listTrainingCatalog(includeInactive = false) {
  const db = await getDb();
  if (!db) return [];
  const q = includeInactive ? db.select().from(trainingCatalog) : db.select().from(trainingCatalog).where(eq(trainingCatalog.active, true));
  return q.orderBy(asc(trainingCatalog.name));
}

export async function createTrainingType(data: { name: string; category?: string; renewalRequired?: boolean; defaultValidityMonths?: number | null }) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const result = await db.insert(trainingCatalog).values(data);
  return result[0].insertId;
}

export async function updateTrainingType(id: number, data: Partial<typeof trainingCatalog.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.update(trainingCatalog).set(data).where(eq(trainingCatalog.id, id));
}

export async function listNurseTrainings(opts: { nurseId?: number } = {}) {
  const db = await getDb();
  if (!db) return [];
  const q = opts.nurseId !== undefined
    ? db.select().from(nurseTrainings).where(eq(nurseTrainings.nurseId, opts.nurseId))
    : db.select().from(nurseTrainings);
  return q.orderBy(desc(nurseTrainings.scheduledDate));
}

export async function createNurseTraining(data: {
  nurseId: number; trainingId: number; provider?: string; status?: "Scheduled" | "Completed" | "Expired" | "Cancelled"; scheduledDate?: Date | null;
  completionDate?: Date | null; expiryDate?: Date | null; trainingHours?: number | null;
  cpdUnits?: number | null; certificateNumber?: string; certificateKey?: string; remarks?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const result = await db.insert(nurseTrainings).values(data);
  return result[0].insertId;
}

export async function updateNurseTraining(id: number, data: Partial<typeof nurseTrainings.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.update(nurseTrainings).set(data).where(eq(nurseTrainings.id, id));
}

export async function getAreaTrainingRequirementIds(areaId: number) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({ trainingId: areaTrainingRequirements.trainingId })
    .from(areaTrainingRequirements)
    .where(and(eq(areaTrainingRequirements.areaId, areaId), eq(areaTrainingRequirements.required, true)));
  return rows.map((r) => r.trainingId);
}

export async function setAreaTrainingRequirement(areaId: number, trainingId: number, required: boolean) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db
    .insert(areaTrainingRequirements)
    .values({ areaId, trainingId, required })
    .onDuplicateKeyUpdate({ set: { required } });
}

/* ---------------- Calendar events ---------------- */
export async function listCustomEvents(opts: { from?: Date; to?: Date; nurseId?: number; areaId?: number } = {}) {
  const db = await getDb();
  if (!db) return [];
  const conds = [];
  if (opts.from) conds.push(gte(customCalendarEvents.eventDate, opts.from));
  if (opts.to) conds.push(lte(customCalendarEvents.eventDate, opts.to));
  if (opts.nurseId !== undefined) conds.push(eq(customCalendarEvents.nurseId, opts.nurseId));
  if (opts.areaId !== undefined) conds.push(eq(customCalendarEvents.areaId, opts.areaId));
  const q = conds.length ? db.select().from(customCalendarEvents).where(and(...conds)) : db.select().from(customCalendarEvents);
  return q.orderBy(asc(customCalendarEvents.eventDate));
}

export async function createCustomEvent(data: {
  title: string; eventDate: Date; startTime?: string | null; endTime?: string | null; allDay?: boolean;
  nurseId?: number | null; areaId?: number | null; description?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const result = await db.insert(customCalendarEvents).values(data);
  return result[0].insertId;
}

export async function updateCustomEvent(id: number, data: Partial<typeof customCalendarEvents.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.update(customCalendarEvents).set(data).where(eq(customCalendarEvents.id, id));
}

export async function deleteCustomEvent(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.delete(customCalendarEvents).where(eq(customCalendarEvents.id, id));
}

/* ---------------- Notifications ---------------- */
export async function listNotifications(limit = 100) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(notifications).orderBy(desc(notifications.createdAt)).limit(limit);
}

export async function countUnreadNotifications() {
  const db = await getDb();
  if (!db) return 0;
  const rows = await db.select({ count: sql<number>`count(*)` }).from(notifications).where(isNull(notifications.readAt));
  return Number(rows[0]?.count ?? 0);
}

function notifEqConditions(
  type: string,
  nurseId: number | null | undefined,
  relatedEntityType: string | null | undefined,
  relatedEntityId: number | null | undefined,
  dayKey: Date,
): SQL<unknown> {
  const parts: SQL<unknown>[] = [eq(notifications.type, type), eq(notifications.dayKey, dayKey)];
  if (nurseId === null || nurseId === undefined) {
    parts.push(isNull(notifications.nurseId));
  } else {
    parts.push(eq(notifications.nurseId, nurseId));
  }
  if (relatedEntityType === null || relatedEntityType === undefined) {
    parts.push(isNull(notifications.relatedEntityType));
  } else {
    parts.push(eq(notifications.relatedEntityType, relatedEntityType));
  }
  if (relatedEntityId === null || relatedEntityId === undefined) {
    parts.push(isNull(notifications.relatedEntityId));
  } else {
    parts.push(eq(notifications.relatedEntityId, relatedEntityId));
  }
  const combined = and(...parts);
  if (!combined) throw new Error("Empty notification conditions");
  return combined as SQL<unknown>;
}

export async function createNotification(data: { type: string; severity: string; title: string; message?: string; nurseId?: number | null; relatedEntityType?: string; relatedEntityId?: number | null; dayKey?: string }): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  // Idempotent via INSERT IGNORE on unique index (type, nurseId, relatedEntityType, relatedEntityId, dayKey).
  const dayKey = data.dayKey != null ? new Date(data.dayKey + "T00:00:00") : new Date(todayDate().slice(0, 10) + "T00:00:00");
  await db.execute(sql`
    INSERT IGNORE INTO ${notifications}
    (type, severity, title, message, nurseId, relatedEntityType, relatedEntityId, dayKey)
    VALUES (${data.type}, ${data.severity}, ${data.title}, ${data.message ?? null}, ${data.nurseId ?? null}, ${data.relatedEntityType ?? null}, ${data.relatedEntityId ?? null}, ${dayKey})
  `);
  // Retrieve the row id (existing or newly inserted).
  const row = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(notifEqConditions(data.type, data.nurseId, data.relatedEntityType, data.relatedEntityId, dayKey))
    .limit(1);
  return row[0]?.id ?? 0;
}
/** Batch version of createNotification — one round trip instead of N. */
export async function createNotificationsBatch(data: Array<{ type: string; severity: string; title: string; message?: string; nurseId?: number | null; relatedEntityType?: string; relatedEntityId?: number | null }>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  if (data.length === 0) return;
  const dayKey = new Date(todayDate().slice(0, 10) + "T00:00:00");
  const rows = data.map((d) => ({
    ...d,
    message: d.message ?? null,
    nurseId: d.nurseId ?? null,
    relatedEntityType: d.relatedEntityType ?? null,
    relatedEntityId: d.relatedEntityId ?? null,
    dayKey,
  }));
  await db.execute(sql`
    INSERT IGNORE INTO ${notifications}
    (type, severity, title, message, nurseId, relatedEntityType, relatedEntityId, dayKey)
    VALUES ${sql.join(
      rows.map(
        (r) => sql`(${r.type}, ${r.severity}, ${r.title}, ${r.message}, ${r.nurseId}, ${r.relatedEntityType}, ${r.relatedEntityId}, ${r.dayKey})`,
      ),
      sql`, `,
    )}
  `);
}

export async function markNotificationRead(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.update(notifications).set({ readAt: new Date() }).where(eq(notifications.id, id));
}

export async function markAllNotificationsRead() {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.update(notifications).set({ readAt: new Date() }).where(isNull(notifications.readAt));
}

/* ---------------- Activity log ---------------- */
export async function logActivity(data: { supervisorId?: number | null; nurseId?: number | null; actionType: string; entityType?: string; entityId?: number | null; summary: string; metadata?: Record<string, unknown> | null }) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.insert(activityLog).values(data);
}

export async function listActivityForNurse(nurseId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(activityLog).where(eq(activityLog.nurseId, nurseId)).orderBy(desc(activityLog.createdAt)).limit(200);
}

/* ---------------- Settings ---------------- */
export async function getSetting(key: string): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(appSettings).where(eq(appSettings.key, key)).limit(1);
  return rows[0]?.value ?? null;
}

export async function setSetting(key: string, value: string | null) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db
    .insert(appSettings)
    .values({ key, value })
    .onDuplicateKeyUpdate({ set: { value } });
}

export async function getAllSettings() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(appSettings);
}

/* ---------------- Aggregates ---------------- */
export async function countActiveNurses(today?: Date) {
  const db = await getDb();
  if (!db) return 0;
  const rows = await db
    .select({ count: sql<number>`count(*)` })
    .from(nurses)
    .where(and(isNull(nurses.archivedAt), not(eq(nurses.employmentStatus, "Archived"))));
  return Number(rows[0]?.count ?? 0);
}
