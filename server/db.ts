import { dateKey, INACTIVE_EMPLOYMENT_STATUSES } from "../shared/nursetrack";
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
import { getSqliteDb } from "./localDb";

let _db: ReturnType<typeof drizzle> | null = null;

/** Drizzle condition: nurse counts as part of the active roster (not archived, not resigned/retired). */
export function activeNurseCondition() {
  return and(isNull(nurses.archivedAt), not(inArray(nurses.employmentStatus, INACTIVE_EMPLOYMENT_STATUSES as any)));
}

/** Same check for raw SQL (sqlite) `IN (...)` clauses. */
export const INACTIVE_STATUS_SQL_LIST = INACTIVE_EMPLOYMENT_STATUSES.map((s) => `'${s}'`).join(", ");

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect MySQL:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (db) {
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
    return;
  }
  const sqlite = getSqliteDb();
  sqlite.prepare(`
    INSERT INTO users (openId, name, email, loginMethod, role, lastSignedIn)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(openId) DO UPDATE SET
      name = COALESCE(excluded.name, users.name),
      email = COALESCE(excluded.email, users.email),
      lastSignedIn = CURRENT_TIMESTAMP
  `).run(user.openId, user.name ?? null, user.email ?? null, user.loginMethod ?? "local", user.role ?? "user");
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (db) {
    const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
    return result.length > 0 ? result[0] : undefined;
  }
  const sqlite = getSqliteDb();
  return sqlite.prepare("SELECT * FROM users WHERE openId = ?").get(openId) as any;
}

/* ---------------- Areas ---------------- */
export async function listAreas(includeInactive = true) {
  const db = await getDb();
  if (db) {
    const q = includeInactive ? db.select().from(areas) : db.select().from(areas).where(eq(areas.active, true));
    return await q.orderBy(asc(areas.sortOrder), asc(areas.name));
  }
  const sqlite = getSqliteDb();
  const query = includeInactive
    ? "SELECT * FROM areas ORDER BY sortOrder ASC, name ASC"
    : "SELECT * FROM areas WHERE active = 1 ORDER BY sortOrder ASC, name ASC";
  const rows = sqlite.prepare(query).all() as any[];
  return rows.map((r) => ({ ...r, active: Boolean(r.active) }));
}

export async function createArea(data: InsertArea) {
  const db = await getDb();
  if (db) {
    const result = await db.insert(areas).values(data);
    return result[0].insertId;
  }
  const sqlite = getSqliteDb();
  const res = sqlite.prepare("INSERT INTO areas (code, name, description, sortOrder, active) VALUES (?, ?, ?, ?, ?)").run(
    data.code, data.name, data.description ?? null, data.sortOrder ?? 99, data.active !== false ? 1 : 0
  );
  return Number(res.lastInsertRowid);
}

export async function updateArea(id: number, data: Partial<InsertArea>) {
  const db = await getDb();
  if (db) {
    await db.update(areas).set(data).where(eq(areas.id, id));
    return;
  }
  const sqlite = getSqliteDb();
  const sets: string[] = [];
  const vals: any[] = [];
  if (data.code !== undefined) { sets.push("code = ?"); vals.push(data.code); }
  if (data.name !== undefined) { sets.push("name = ?"); vals.push(data.name); }
  if (data.description !== undefined) { sets.push("description = ?"); vals.push(data.description); }
  if (data.sortOrder !== undefined) { sets.push("sortOrder = ?"); vals.push(data.sortOrder); }
  if (data.active !== undefined) { sets.push("active = ?"); vals.push(data.active ? 1 : 0); }
  if (sets.length) {
    vals.push(id);
    sqlite.prepare(`UPDATE areas SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
  }
}

export async function getAreaById(id: number) {
  const db = await getDb();
  if (db) {
    const rows = await db.select().from(areas).where(eq(areas.id, id)).limit(1);
    return rows[0];
  }
  const sqlite = getSqliteDb();
  const r = sqlite.prepare("SELECT * FROM areas WHERE id = ?").get(id) as any;
  return r ? { ...r, active: Boolean(r.active) } : undefined;
}

/* ---------------- Nurses ---------------- */
export async function createNurse(data: InsertNurse) {
  const db = await getDb();
  if (db) {
    const result = await db.insert(nurses).values(data);
    return result[0].insertId;
  }
  const sqlite = getSqliteDb();
  const res = sqlite.prepare(`
    INSERT INTO nurses (employeeId, firstName, middleName, lastName, suffix, position, staffType, dateHired, employmentStatus, currentAreaId, profilePhotoKey)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.employeeId, data.firstName, data.middleName ?? null, data.lastName, data.suffix ?? null,
    data.position ?? null, data.staffType ?? "Registered Nurse", data.dateHired ? String(data.dateHired) : null,
    data.employmentStatus ?? "Active", data.currentAreaId ?? null, data.profilePhotoKey ?? null
  );
  return Number(res.lastInsertRowid);
}

export async function updateNurse(id: number, data: Partial<InsertNurse>) {
  const db = await getDb();
  if (db) {
    await db.update(nurses).set(data).where(eq(nurses.id, id));
    return;
  }
  const sqlite = getSqliteDb();
  const sets: string[] = [];
  const vals: any[] = [];
  const fields = ["employeeId", "firstName", "middleName", "lastName", "suffix", "position", "staffType", "employmentStatus", "currentAreaId", "profilePhotoKey", "archivedAt"] as const;
  for (const f of fields) {
    if (data[f] !== undefined) {
      sets.push(`${f} = ?`);
      vals.push(data[f] instanceof Date ? data[f].toISOString().slice(0, 19).replace("T", " ") : data[f] ?? null);
    }
  }
  if (data.dateHired !== undefined) {
    sets.push("dateHired = ?");
    vals.push(data.dateHired ? String(data.dateHired) : null);
  }
  if (sets.length) {
    vals.push(id);
    sqlite.prepare(`UPDATE nurses SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
  }
}

export async function listNurses(opts: { archived?: boolean; areaId?: number; employmentStatus?: string } = {}) {
  const db = await getDb();
  if (db) {
    const conds = [];
    if (opts.archived === false) conds.push(isNull(nurses.archivedAt));
    if (opts.archived === true) conds.push(isNotNull(nurses.archivedAt));
    if (opts.areaId !== undefined) conds.push(eq(nurses.currentAreaId, opts.areaId));
    if (opts.employmentStatus) conds.push(eq(nurses.employmentStatus, opts.employmentStatus as never));
    const q = conds.length ? db.select().from(nurses).where(and(...conds)) : db.select().from(nurses);
    return await q.orderBy(asc(nurses.lastName), asc(nurses.firstName));
  }
  const sqlite = getSqliteDb();
  const conds: string[] = [];
  const params: any[] = [];
  if (opts.archived === false) conds.push("archivedAt IS NULL");
  if (opts.archived === true) conds.push("archivedAt IS NOT NULL");
  if (opts.areaId !== undefined) { conds.push("currentAreaId = ?"); params.push(opts.areaId); }
  if (opts.employmentStatus) { conds.push("employmentStatus = ?"); params.push(opts.employmentStatus); }
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
  return sqlite.prepare(`SELECT * FROM nurses ${where} ORDER BY lastName ASC, firstName ASC`).all(...params) as any[];
}

export async function getNurseByEmployeeId(employeeId: string) {
  const db = await getDb();
  if (db) {
    const rows = await db.select().from(nurses).where(eq(nurses.employeeId, employeeId)).limit(1);
    return rows[0];
  }
  const sqlite = getSqliteDb();
  return sqlite.prepare("SELECT * FROM nurses WHERE employeeId = ?").get(employeeId) as any;
}

/** The nurse record a given Google account (users.id) is linked to, if any. */
export async function getNurseByLinkedUserId(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(nurses).where(eq(nurses.linkedUserId, userId)).limit(1);
  return rows[0];
}

const normalizeForMatch = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** All nurseIds carrying a credential whose licenseNumber matches (normalized). */
async function findNurseIdsByLicenseNumber(licenseNumber: string): Promise<number[]> {
  const db = await getDb();
  if (!db) return [];
  const normPrc = normalizeForMatch(licenseNumber);
  const credRows = await db
    .select({ nurseId: nurseCredentials.nurseId, licenseNumber: nurseCredentials.licenseNumber })
    .from(nurseCredentials)
    .where(isNotNull(nurseCredentials.licenseNumber));
  return credRows.filter((r) => r.licenseNumber && normalizeForMatch(r.licenseNumber) === normPrc).map((r) => r.nurseId);
}

/**
 * Self-service link: a signed-in staff member proves who they are with their
 * PRC/license number + full name, and we link their Google account (userId)
 * to the matching, not-yet-linked nurse record.
 */
export async function linkNurseByPrcAndName(
  prcNumber: string,
  fullName: string,
  userId: number
): Promise<{ ok: true; nurse: typeof nurses.$inferSelect } | { ok: false; reason: "not_found" | "already_linked" }> {
  const db = await getDb();
  if (!db) return { ok: false, reason: "not_found" };

  const normName = normalizeForMatch(fullName);
  const nurseIds = await findNurseIdsByLicenseNumber(prcNumber);
  if (nurseIds.length === 0) return { ok: false, reason: "not_found" };

  const candidates = await db.select().from(nurses).where(inArray(nurses.id, nurseIds));
  const match = candidates.find((n) => {
    const candidateName = `${n.firstName} ${n.middleName ?? ""} ${n.lastName} ${n.suffix ?? ""}`;
    return normalizeForMatch(candidateName) === normName || normalizeForMatch(`${n.firstName} ${n.lastName}`) === normName;
  });
  if (!match) return { ok: false, reason: "not_found" };
  if (match.linkedUserId) return { ok: false, reason: "already_linked" };

  await db.update(nurses).set({ linkedUserId: userId }).where(eq(nurses.id, match.id));
  return { ok: true, nurse: { ...match, linkedUserId: userId } };
}

/**
 * Bulk-populate nurses.accountEmail from an HR spreadsheet, matched by
 * license/PRC number. Skips license numbers matching zero or multiple
 * nurses (ambiguous). Does not set linkedUserId — that only happens when the
 * person actually signs in with that Google account (see autoLinkNurseByEmail).
 */
export async function bulkSetAccountEmailsByLicense(
  rows: Array<{ licenseNumber: string; email: string }>
): Promise<{ matched: number; ambiguous: number; notFound: number }> {
  const db = await getDb();
  if (!db) return { matched: 0, ambiguous: 0, notFound: 0 };
  let matched = 0, ambiguous = 0, notFound = 0;
  for (const row of rows) {
    if (!row.licenseNumber || !row.email) continue;
    const nurseIds = await findNurseIdsByLicenseNumber(row.licenseNumber);
    if (nurseIds.length === 0) { notFound++; continue; }
    if (nurseIds.length > 1) { ambiguous++; continue; }
    await db.update(nurses).set({ accountEmail: row.email }).where(eq(nurses.id, nurseIds[0]));
    matched++;
  }
  return { matched, ambiguous, notFound };
}

/**
 * Called right after a Google login resolves. If this account's email
 * matches a nurse's pre-filled accountEmail and that nurse isn't linked to
 * anyone yet, link them automatically — no PRC/name prompt needed.
 */
export async function autoLinkNurseByEmail(userId: number, email: string | null | undefined): Promise<void> {
  if (!email) return;
  const db = await getDb();
  if (!db) return;
  const existing = await db.select().from(nurses).where(eq(nurses.linkedUserId, userId)).limit(1);
  if (existing.length > 0) return; // already linked to someone
  const rows = await db.select().from(nurses).where(eq(nurses.accountEmail, email)).limit(1);
  const candidate = rows[0];
  if (!candidate || candidate.linkedUserId) return;
  await db.update(nurses).set({ linkedUserId: userId }).where(eq(nurses.id, candidate.id));
}

function deriveLicenseStatusFromCred(cred: { renewalStatus: string; expiryDate: string | Date }): string {
  if (cred.renewalStatus === "Renewed") return "Valid";
  const days = Math.floor((parseLocalDate(cred.expiryDate).getTime() - parseLocalDate(todayDate()).getTime()) / 86400000);
  if (days < 0) return "Expired";
  if (days <= 180) return "Within 6 Months";
  if (days <= 365) return "Within 1 Year";
  return "Valid";
}

/** Status + license number of a nurse's most current credential (latest expiryDate on file). */
export async function getNurseLicenseInfo(nurseId: number): Promise<{ status: string | null; licenseNumber: string | null }> {
  const db = await getDb();
  if (db) {
    const rows = await db
      .select()
      .from(nurseCredentials)
      .where(eq(nurseCredentials.nurseId, nurseId))
      .orderBy(desc(nurseCredentials.expiryDate))
      .limit(1);
    const cred = rows[0];
    if (!cred) return { status: null, licenseNumber: null };
    return { status: deriveLicenseStatusFromCred(cred), licenseNumber: cred.licenseNumber ?? null };
  }
  const sqlite = getSqliteDb();
  const cred = sqlite.prepare("SELECT * FROM nurseCredentials WHERE nurseId = ? ORDER BY date(expiryDate) DESC LIMIT 1").get(nurseId) as any;
  if (!cred) return { status: null, licenseNumber: null };
  return { status: deriveLicenseStatusFromCred(cred), licenseNumber: cred.licenseNumber ?? null };
}

export async function getNurseLicenseStatus(nurseId: number): Promise<string | null> {
  return (await getNurseLicenseInfo(nurseId)).status;
}

function parseLocalDate(value: string | Date): Date {
  if (value instanceof Date) return value;
  const [y, m, d] = String(value).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function todayDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function getNurseById(id: number) {
  const db = await getDb();
  if (db) {
    const rows = await db.select().from(nurses).where(eq(nurses.id, id)).limit(1);
    return rows[0];
  }
  const sqlite = getSqliteDb();
  return sqlite.prepare("SELECT * FROM nurses WHERE id = ?").get(id) as any;
}

export async function searchNurses(query: string) {
  const db = await getDb();
  if (db) {
    const term = `%${query.trim()}%`;
    return await db
      .select()
      .from(nurses)
      .where(and(isNull(nurses.archivedAt), or(like(nurses.firstName, term), like(nurses.middleName, term), like(nurses.lastName, term), like(nurses.employeeId, term))))
      .orderBy(asc(nurses.lastName), asc(nurses.firstName))
      .limit(10);
  }
  const sqlite = getSqliteDb();
  const term = `%${query.trim()}%`;
  return sqlite.prepare(`
    SELECT * FROM nurses 
    WHERE archivedAt IS NULL AND (firstName LIKE ? OR middleName LIKE ? OR lastName LIKE ? OR employeeId LIKE ?)
    ORDER BY lastName ASC, firstName ASC
    LIMIT 10
  `).all(term, term, term, term) as any[];
}

/* ---------------- Area assignments ---------------- */
export async function listAssignmentsForNurse(nurseId: number) {
  const db = await getDb();
  if (db) {
    return await db
      .select()
      .from(areaAssignments)
      .where(eq(areaAssignments.nurseId, nurseId))
      .orderBy(desc(areaAssignments.startDate));
  }
  const sqlite = getSqliteDb();
  const rows = sqlite.prepare("SELECT * FROM areaAssignments WHERE nurseId = ? ORDER BY date(startDate) DESC").all(nurseId) as any[];
  return rows.map((r) => ({ ...r, isCurrent: Boolean(r.isCurrent) }));
}

export async function createAssignment(data: { nurseId: number; areaId: number; startDate: Date | string; endDate?: Date | string | null; assignmentType?: string; remarks?: string; isCurrent?: boolean }) {
  const db = await getDb();
  if (db) {
    const result = await db.insert(areaAssignments).values(data as any);
    return result[0].insertId;
  }
  const sqlite = getSqliteDb();
  const start = data.startDate instanceof Date ? data.startDate.toISOString().slice(0, 10) : String(data.startDate);
  const end = data.endDate ? (data.endDate instanceof Date ? data.endDate.toISOString().slice(0, 10) : String(data.endDate)) : null;
  const res = sqlite.prepare(`
    INSERT INTO areaAssignments (nurseId, areaId, startDate, endDate, assignmentType, remarks, isCurrent)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(data.nurseId, data.areaId, start, end, data.assignmentType ?? null, data.remarks ?? null, data.isCurrent ? 1 : 0);
  return Number(res.lastInsertRowid);
}

export async function closeAssignment(id: number, endDate: Date | string) {
  const db = await getDb();
  if (db) {
    await db.update(areaAssignments).set({ endDate: endDate as any, isCurrent: false }).where(eq(areaAssignments.id, id));
    return;
  }
  const sqlite = getSqliteDb();
  const end = endDate instanceof Date ? endDate.toISOString().slice(0, 10) : String(endDate);
  sqlite.prepare("UPDATE areaAssignments SET endDate = ?, isCurrent = 0 WHERE id = ?").run(end, id);
}

export async function clearCurrentAssignmentsForNurse(nurseId: number) {
  const db = await getDb();
  if (db) {
    await db.update(areaAssignments).set({ isCurrent: false }).where(eq(areaAssignments.nurseId, nurseId));
    return;
  }
  const sqlite = getSqliteDb();
  sqlite.prepare("UPDATE areaAssignments SET isCurrent = 0 WHERE nurseId = ?").run(nurseId);
}

export async function getAssignmentsForArea(areaId: number) {
  const db = await getDb();
  if (db) {
    return await db
      .select({
        assignment: areaAssignments,
        nurse: nurses,
      })
      .from(areaAssignments)
      .innerJoin(nurses, eq(nurses.id, areaAssignments.nurseId))
      .where(and(eq(areaAssignments.areaId, areaId), eq(areaAssignments.isCurrent, true), isNull(nurses.archivedAt)));
  }
  const sqlite = getSqliteDb();
  const rows = sqlite.prepare(`
    SELECT a.id as a_id, a.nurseId, a.areaId, a.startDate, a.endDate, a.assignmentType, a.remarks, a.isCurrent,
           n.id as n_id, n.employeeId, n.firstName, n.middleName, n.lastName, n.suffix, n.position, n.staffType, n.currentAreaId, n.archivedAt
    FROM areaAssignments a
    INNER JOIN nurses n ON n.id = a.nurseId
    WHERE a.areaId = ? AND a.isCurrent = 1 AND n.archivedAt IS NULL
  `).all(areaId) as any[];

  return rows.map((r) => ({
    assignment: {
      id: r.a_id,
      nurseId: r.nurseId,
      areaId: r.areaId,
      startDate: r.startDate,
      endDate: r.endDate,
      assignmentType: r.assignmentType,
      remarks: r.remarks,
      isCurrent: Boolean(r.isCurrent),
    },
    nurse: {
      id: r.n_id,
      employeeId: r.employeeId,
      firstName: r.firstName,
      middleName: r.middleName,
      lastName: r.lastName,
      suffix: r.suffix,
      position: r.position,
      staffType: r.staffType,
      currentAreaId: r.currentAreaId,
      archivedAt: r.archivedAt,
    },
  }));
}

/* ---------------- Credentials (licenses) ---------------- */
export async function listCredentials(opts: { nurseId?: number } = {}) {
  const db = await getDb();
  if (db) {
    const q = opts.nurseId !== undefined
      ? db.select().from(nurseCredentials).where(eq(nurseCredentials.nurseId, opts.nurseId))
      : db.select().from(nurseCredentials);
    return await q.orderBy(asc(nurseCredentials.expiryDate));
  }
  const sqlite = getSqliteDb();
  if (opts.nurseId !== undefined) {
    return sqlite.prepare("SELECT * FROM nurseCredentials WHERE nurseId = ? ORDER BY date(expiryDate) ASC").all(opts.nurseId) as any[];
  }
  return sqlite.prepare("SELECT * FROM nurseCredentials ORDER BY date(expiryDate) ASC").all() as any[];
}

export async function createCredential(data: {
  nurseId: number; credentialTypeId: number; licenseNumber?: string; issuingOrganization?: string;
  issueDate?: Date | string | null; expiryDate: Date | string; renewalStatus?: "Not Started" | "Renewal In Progress" | "Submitted" | "Renewed"; verificationStatus?: "Unverified" | "Pending Verification" | "Verified";
  documentKey?: string; renewalCycleKey: string; remarks?: string;
}) {
  const db = await getDb();
  if (db) {
    const result = await db.insert(nurseCredentials).values(data as any);
    return result[0].insertId;
  }
  const sqlite = getSqliteDb();
  const issue = data.issueDate ? (data.issueDate instanceof Date ? data.issueDate.toISOString().slice(0, 10) : String(data.issueDate)) : null;
  const expiry = data.expiryDate instanceof Date ? data.expiryDate.toISOString().slice(0, 10) : String(data.expiryDate);
  const res = sqlite.prepare(`
    INSERT INTO nurseCredentials (nurseId, credentialTypeId, licenseNumber, issuingOrganization, issueDate, expiryDate, renewalStatus, verificationStatus, documentKey, renewalCycleKey, remarks)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.nurseId, data.credentialTypeId, data.licenseNumber ?? null, data.issuingOrganization ?? null,
    issue, expiry, data.renewalStatus ?? "Not Started", data.verificationStatus ?? "Unverified",
    data.documentKey ?? null, data.renewalCycleKey, data.remarks ?? null
  );
  return Number(res.lastInsertRowid);
}

export async function updateCredential(id: number, data: Partial<typeof nurseCredentials.$inferInsert>) {
  const db = await getDb();
  if (db) {
    await db.update(nurseCredentials).set(data).where(eq(nurseCredentials.id, id));
    return;
  }
  const sqlite = getSqliteDb();
  const sets: string[] = [];
  const vals: any[] = [];
  const fields = ["licenseNumber", "issuingOrganization", "renewalStatus", "verificationStatus", "documentKey", "renewalCycleKey", "remarks"] as const;
  for (const f of fields) {
    if (data[f] !== undefined) { sets.push(`${f} = ?`); vals.push(data[f] ?? null); }
  }
  if (data.issueDate !== undefined) {
    sets.push("issueDate = ?");
    vals.push(data.issueDate ? (data.issueDate instanceof Date ? data.issueDate.toISOString().slice(0, 10) : String(data.issueDate)) : null);
  }
  if (data.expiryDate !== undefined) {
    sets.push("expiryDate = ?");
    vals.push(data.expiryDate instanceof Date ? data.expiryDate.toISOString().slice(0, 10) : String(data.expiryDate));
  }
  if (sets.length) {
    vals.push(id);
    sqlite.prepare(`UPDATE nurseCredentials SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
  }
}

export async function listCredentialTypes(includeInactive = true) {
  const db = await getDb();
  if (db) {
    const q = includeInactive ? db.select().from(credentialTypes) : db.select().from(credentialTypes).where(eq(credentialTypes.active, true));
    return await q.orderBy(asc(credentialTypes.name));
  }
  const sqlite = getSqliteDb();
  const query = includeInactive ? "SELECT * FROM credentialTypes ORDER BY name ASC" : "SELECT * FROM credentialTypes WHERE active = 1 ORDER BY name ASC";
  const rows = sqlite.prepare(query).all() as any[];
  return rows.map((r) => ({ ...r, active: Boolean(r.active) }));
}

export async function createCredentialType(name: string, issuingOrganizationDefault?: string) {
  const db = await getDb();
  if (db) {
    const result = await db.insert(credentialTypes).values({ name, issuingOrganizationDefault });
    return result[0].insertId;
  }
  const sqlite = getSqliteDb();
  const res = sqlite.prepare("INSERT INTO credentialTypes (name, issuingOrganizationDefault, active) VALUES (?, ?, 1)").run(name, issuingOrganizationDefault ?? null);
  return Number(res.lastInsertRowid);
}

export async function updateCredentialType(id: number, data: { name?: string; issuingOrganizationDefault?: string; active?: boolean }) {
  const db = await getDb();
  if (db) {
    await db.update(credentialTypes).set(data).where(eq(credentialTypes.id, id));
    return;
  }
  const sqlite = getSqliteDb();
  const sets: string[] = [];
  const vals: any[] = [];
  if (data.name !== undefined) { sets.push("name = ?"); vals.push(data.name); }
  if (data.issuingOrganizationDefault !== undefined) { sets.push("issuingOrganizationDefault = ?"); vals.push(data.issuingOrganizationDefault); }
  if (data.active !== undefined) { sets.push("active = ?"); vals.push(data.active ? 1 : 0); }
  if (sets.length) {
    vals.push(id);
    sqlite.prepare(`UPDATE credentialTypes SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
  }
}

/* ---------------- License reminders ---------------- */
export async function listReminders() {
  const db = await getDb();
  if (db) return await db.select().from(licenseReminders).orderBy(desc(licenseReminders.generatedAt));
  const sqlite = getSqliteDb();
  return sqlite.prepare("SELECT * FROM licenseReminders ORDER BY date(generatedAt) DESC").all() as any[];
}

export async function createReminder(data: { credentialId: number; thresholdDays: number; renewalCycleKey: string; triggerDate: Date | string }): Promise<number> {
  const db = await getDb();
  if (db) {
    const existing = await db
      .select({ id: licenseReminders.id })
      .from(licenseReminders)
      .where(and(eq(licenseReminders.credentialId, data.credentialId), eq(licenseReminders.thresholdDays, data.thresholdDays), eq(licenseReminders.renewalCycleKey, data.renewalCycleKey)))
      .limit(1);
    if (existing.length > 0) return existing[0].id;
    const result = await db.insert(licenseReminders).values(data as any);
    return result[0].insertId;
  }
  const sqlite = getSqliteDb();
  const existing = sqlite.prepare("SELECT id FROM licenseReminders WHERE credentialId = ? AND thresholdDays = ? AND renewalCycleKey = ?").get(data.credentialId, data.thresholdDays, data.renewalCycleKey) as any;
  if (existing) return existing.id;
  const trigger = data.triggerDate instanceof Date ? data.triggerDate.toISOString().slice(0, 10) : String(data.triggerDate);
  const res = sqlite.prepare("INSERT INTO licenseReminders (credentialId, thresholdDays, renewalCycleKey, triggerDate) VALUES (?, ?, ?, ?)").run(data.credentialId, data.thresholdDays, data.renewalCycleKey, trigger);
  return Number(res.lastInsertRowid);
}

export async function acknowledgeReminder(id: number) {
  const db = await getDb();
  if (db) {
    await db.update(licenseReminders).set({ acknowledgedAt: new Date(), status: "acknowledged" }).where(eq(licenseReminders.id, id));
    return;
  }
  const sqlite = getSqliteDb();
  sqlite.prepare("UPDATE licenseReminders SET acknowledgedAt = CURRENT_TIMESTAMP, status = 'acknowledged' WHERE id = ?").run(id);
}

export async function markReminderExpiredByCredential(credentialId: number) {
  const db = await getDb();
  if (db) {
    await db.update(licenseReminders).set({ status: "expired" }).where(eq(licenseReminders.credentialId, credentialId));
    return;
  }
  const sqlite = getSqliteDb();
  sqlite.prepare("UPDATE licenseReminders SET status = 'expired' WHERE credentialId = ?").run(credentialId);
}

/* ---------------- Training ---------------- */
export async function listTrainingCatalog(includeInactive = false) {
  const db = await getDb();
  if (db) {
    const q = includeInactive ? db.select().from(trainingCatalog) : db.select().from(trainingCatalog).where(eq(trainingCatalog.active, true));
    return await q.orderBy(asc(trainingCatalog.name));
  }
  const sqlite = getSqliteDb();
  const query = includeInactive ? "SELECT * FROM trainingCatalog ORDER BY name ASC" : "SELECT * FROM trainingCatalog WHERE active = 1 ORDER BY name ASC";
  const rows = sqlite.prepare(query).all() as any[];
  return rows.map((r) => ({ ...r, active: Boolean(r.active), renewalRequired: Boolean(r.renewalRequired) }));
}

export async function createTrainingType(data: { name: string; category?: string; kind?: "Training" | "Seminar" | "LDI"; renewalRequired?: boolean; defaultValidityMonths?: number | null }) {
  const db = await getDb();
  if (db) {
    const result = await db.insert(trainingCatalog).values(data as any);
    return result[0].insertId;
  }
  const sqlite = getSqliteDb();
  const res = sqlite.prepare("INSERT INTO trainingCatalog (name, category, kind, renewalRequired, defaultValidityMonths, active) VALUES (?, ?, ?, ?, ?, 1)").run(
    data.name, data.category ?? null, data.kind ?? "Training", data.renewalRequired ? 1 : 0, data.defaultValidityMonths ?? null
  );
  return Number(res.lastInsertRowid);
}

export async function updateTrainingType(id: number, data: Partial<typeof trainingCatalog.$inferInsert>) {
  const db = await getDb();
  if (db) {
    await db.update(trainingCatalog).set(data).where(eq(trainingCatalog.id, id));
    return;
  }
  const sqlite = getSqliteDb();
  const sets: string[] = [];
  const vals: any[] = [];
  if (data.name !== undefined) { sets.push("name = ?"); vals.push(data.name); }
  if (data.category !== undefined) { sets.push("category = ?"); vals.push(data.category); }
  if (data.kind !== undefined) { sets.push("kind = ?"); vals.push(data.kind); }
  if (data.renewalRequired !== undefined) { sets.push("renewalRequired = ?"); vals.push(data.renewalRequired ? 1 : 0); }
  if (data.defaultValidityMonths !== undefined) { sets.push("defaultValidityMonths = ?"); vals.push(data.defaultValidityMonths); }
  if (data.active !== undefined) { sets.push("active = ?"); vals.push(data.active ? 1 : 0); }
  if (sets.length) {
    vals.push(id);
    sqlite.prepare(`UPDATE trainingCatalog SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
  }
}

export async function listNurseTrainings(opts: { nurseId?: number } = {}) {
  const db = await getDb();
  if (db) {
    const q = opts.nurseId !== undefined
      ? db.select().from(nurseTrainings).where(eq(nurseTrainings.nurseId, opts.nurseId))
      : db.select().from(nurseTrainings);
    return await q.orderBy(desc(nurseTrainings.scheduledDate));
  }
  const sqlite = getSqliteDb();
  if (opts.nurseId !== undefined) {
    return sqlite.prepare("SELECT * FROM nurseTrainings WHERE nurseId = ? ORDER BY date(scheduledDate) DESC").all(opts.nurseId) as any[];
  }
  return sqlite.prepare("SELECT * FROM nurseTrainings ORDER BY date(scheduledDate) DESC").all() as any[];
}

export async function createNurseTraining(data: {
  nurseId: number; trainingId: number; eventId?: number; provider?: string; status?: "Scheduled" | "Completed" | "Expired" | "Cancelled";
  scheduledDate?: Date | string | null; completionDate?: Date | string | null; expiryDate?: Date | string | null; trainingHours?: number | null;
  cpdUnits?: number | null; certificateNumber?: string; certificateKey?: string; remarks?: string; participationRole?: "Participant" | "Speaker" | "Facilitator" | "Preceptor";
}) {
  const db = await getDb();
  if (db) {
    const result = await db.insert(nurseTrainings).values(data as any);
    return result[0].insertId;
  }
  const sqlite = getSqliteDb();
  const sched = data.scheduledDate ? (data.scheduledDate instanceof Date ? data.scheduledDate.toISOString().slice(0, 10) : String(data.scheduledDate)) : null;
  const comp = data.completionDate ? (data.completionDate instanceof Date ? data.completionDate.toISOString().slice(0, 10) : String(data.completionDate)) : null;
  const exp = data.expiryDate ? (data.expiryDate instanceof Date ? data.expiryDate.toISOString().slice(0, 10) : String(data.expiryDate)) : null;
  const res = sqlite.prepare(`
    INSERT INTO nurseTrainings (nurseId, trainingId, eventId, participationRole, provider, status, scheduledDate, completionDate, expiryDate, trainingHours, cpdUnits, certificateNumber, certificateKey, remarks)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.nurseId, data.trainingId, data.eventId ?? null, data.participationRole ?? "Participant",
    data.provider ?? null, data.status ?? "Scheduled", sched, comp, exp,
    data.trainingHours ?? null, data.cpdUnits ?? null, data.certificateNumber ?? null,
    data.certificateKey ?? null, data.remarks ?? null
  );
  return Number(res.lastInsertRowid);
}

export async function updateNurseTraining(id: number, data: Partial<typeof nurseTrainings.$inferInsert>) {
  const db = await getDb();
  if (db) {
    await db.update(nurseTrainings).set(data).where(eq(nurseTrainings.id, id));
    return;
  }
  const sqlite = getSqliteDb();
  const sets: string[] = [];
  const vals: any[] = [];
  const fields = ["status", "participationRole", "provider", "trainingHours", "cpdUnits", "certificateNumber", "certificateKey", "remarks"] as const;
  for (const f of fields) {
    if (data[f] !== undefined) { sets.push(`${f} = ?`); vals.push(data[f] ?? null); }
  }
  if (data.scheduledDate !== undefined) {
    sets.push("scheduledDate = ?");
    vals.push(data.scheduledDate ? (data.scheduledDate instanceof Date ? data.scheduledDate.toISOString().slice(0, 10) : String(data.scheduledDate)) : null);
  }
  if (data.completionDate !== undefined) {
    sets.push("completionDate = ?");
    vals.push(data.completionDate ? (data.completionDate instanceof Date ? data.completionDate.toISOString().slice(0, 10) : String(data.completionDate)) : null);
  }
  if (data.expiryDate !== undefined) {
    sets.push("expiryDate = ?");
    vals.push(data.expiryDate ? (data.expiryDate instanceof Date ? data.expiryDate.toISOString().slice(0, 10) : String(data.expiryDate)) : null);
  }
  if (sets.length) {
    vals.push(id);
    sqlite.prepare(`UPDATE nurseTrainings SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
  }
}

export async function getAreaTrainingRequirementIds(areaId: number) {
  const db = await getDb();
  if (db) {
    const rows = await db
      .select({ trainingId: areaTrainingRequirements.trainingId })
      .from(areaTrainingRequirements)
      .where(and(eq(areaTrainingRequirements.areaId, areaId), eq(areaTrainingRequirements.required, true)));
    return rows.map((r) => r.trainingId);
  }
  const sqlite = getSqliteDb();
  const rows = sqlite.prepare("SELECT trainingId FROM areaTrainingRequirements WHERE areaId = ? AND required = 1").all(areaId) as { trainingId: number }[];
  return rows.map((r) => r.trainingId);
}

export async function setAreaTrainingRequirement(areaId: number, trainingId: number, required: boolean) {
  const db = await getDb();
  if (db) {
    await db
      .insert(areaTrainingRequirements)
      .values({ areaId, trainingId, required })
      .onDuplicateKeyUpdate({ set: { required } });
    return;
  }
  const sqlite = getSqliteDb();
  sqlite.prepare("INSERT INTO areaTrainingRequirements (areaId, trainingId, required) VALUES (?, ?, ?) ON CONFLICT(areaId, trainingId) DO UPDATE SET required = excluded.required").run(areaId, trainingId, required ? 1 : 0);
}

/* ---------------- Calendar events ---------------- */
export async function listCustomEvents(opts: { from?: Date | string; to?: Date | string; nurseId?: number; areaId?: number } = {}) {
  const db = await getDb();
  if (db) {
    const conds = [];
    if (opts.from) conds.push(gte(customCalendarEvents.eventDate, opts.from as any));
    if (opts.to) conds.push(lte(customCalendarEvents.eventDate, opts.to as any));
    if (opts.nurseId !== undefined) conds.push(eq(customCalendarEvents.nurseId, opts.nurseId));
    if (opts.areaId !== undefined) conds.push(eq(customCalendarEvents.areaId, opts.areaId));
    const q = conds.length ? db.select().from(customCalendarEvents).where(and(...conds)) : db.select().from(customCalendarEvents);
    return await q.orderBy(asc(customCalendarEvents.eventDate));
  }
  const sqlite = getSqliteDb();
  const conds: string[] = [];
  const params: any[] = [];
  if (opts.from) { conds.push("date(eventDate) >= date(?)"); params.push(opts.from instanceof Date ? opts.from.toISOString().slice(0, 10) : String(opts.from)); }
  if (opts.to) { conds.push("date(eventDate) <= date(?)"); params.push(opts.to instanceof Date ? opts.to.toISOString().slice(0, 10) : String(opts.to)); }
  if (opts.nurseId !== undefined) { conds.push("nurseId = ?"); params.push(opts.nurseId); }
  if (opts.areaId !== undefined) { conds.push("areaId = ?"); params.push(opts.areaId); }
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
  const rows = sqlite.prepare(`SELECT * FROM customCalendarEvents ${where} ORDER BY date(eventDate) ASC`).all(...params) as any[];
  return rows.map((r) => ({ ...r, allDay: Boolean(r.allDay) }));
}

export async function createCustomEvent(data: {
  title: string; eventDate: Date | string; startTime?: string | null; endTime?: string | null; allDay?: boolean;
  nurseId?: number | null; areaId?: number | null; description?: string;
}) {
  const db = await getDb();
  if (db) {
    const result = await db.insert(customCalendarEvents).values(data as any);
    return result[0].insertId;
  }
  const sqlite = getSqliteDb();
  const dateStr = data.eventDate instanceof Date ? data.eventDate.toISOString().slice(0, 10) : String(data.eventDate);
  const res = sqlite.prepare("INSERT INTO customCalendarEvents (title, eventDate, startTime, endTime, allDay, nurseId, areaId, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(
    data.title, dateStr, data.startTime ?? null, data.endTime ?? null, data.allDay !== false ? 1 : 0, data.nurseId ?? null, data.areaId ?? null, data.description ?? null
  );
  return Number(res.lastInsertRowid);
}

export async function updateCustomEvent(id: number, data: Partial<typeof customCalendarEvents.$inferInsert>) {
  const db = await getDb();
  if (db) {
    await db.update(customCalendarEvents).set(data).where(eq(customCalendarEvents.id, id));
    return;
  }
  const sqlite = getSqliteDb();
  const sets: string[] = [];
  const vals: any[] = [];
  if (data.title !== undefined) { sets.push("title = ?"); vals.push(data.title); }
  if (data.eventDate !== undefined) { sets.push("eventDate = ?"); vals.push(data.eventDate instanceof Date ? data.eventDate.toISOString().slice(0, 10) : String(data.eventDate)); }
  if (data.startTime !== undefined) { sets.push("startTime = ?"); vals.push(data.startTime); }
  if (data.endTime !== undefined) { sets.push("endTime = ?"); vals.push(data.endTime); }
  if (data.allDay !== undefined) { sets.push("allDay = ?"); vals.push(data.allDay ? 1 : 0); }
  if (data.nurseId !== undefined) { sets.push("nurseId = ?"); vals.push(data.nurseId); }
  if (data.areaId !== undefined) { sets.push("areaId = ?"); vals.push(data.areaId); }
  if (data.description !== undefined) { sets.push("description = ?"); vals.push(data.description); }
  if (sets.length) {
    vals.push(id);
    sqlite.prepare(`UPDATE customCalendarEvents SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
  }
}

export async function deleteCustomEvent(id: number) {
  const db = await getDb();
  if (db) {
    await db.delete(customCalendarEvents).where(eq(customCalendarEvents.id, id));
    return;
  }
  const sqlite = getSqliteDb();
  sqlite.prepare("DELETE FROM customCalendarEvents WHERE id = ?").run(id);
}

/* ---------------- Notifications ---------------- */
export async function listNotifications(limit = 100) {
  const db = await getDb();
  if (db) return await db.select().from(notifications).orderBy(desc(notifications.createdAt)).limit(limit);
  const sqlite = getSqliteDb();
  return sqlite.prepare("SELECT * FROM notifications ORDER BY date(createdAt) DESC LIMIT ?").all(limit) as any[];
}

export async function countUnreadNotifications() {
  const db = await getDb();
  if (db) {
    const rows = await db.select({ count: sql<number>`count(*)` }).from(notifications).where(isNull(notifications.readAt));
    return Number(rows[0]?.count ?? 0);
  }
  const sqlite = getSqliteDb();
  const row = sqlite.prepare("SELECT count(*) as count FROM notifications WHERE readAt IS NULL").get() as { count: number };
  return row.count;
}

export async function createNotification(data: { type: string; severity: string; title: string; message?: string; nurseId?: number | null; relatedEntityType?: string; relatedEntityId?: number | null; dayKey?: string }): Promise<number> {
  const db = await getDb();
  if (db) {
    const dayKey = data.dayKey != null ? new Date(data.dayKey + "T00:00:00") : new Date(todayDate().slice(0, 10) + "T00:00:00");
    await db.execute(sql`
      INSERT IGNORE INTO ${notifications}
      (type, severity, title, message, nurseId, relatedEntityType, relatedEntityId, dayKey)
      VALUES (${data.type}, ${data.severity}, ${data.title}, ${data.message ?? null}, ${data.nurseId ?? null}, ${data.relatedEntityType ?? null}, ${data.relatedEntityId ?? null}, ${dayKey})
    `);
    return 1;
  }
  const sqlite = getSqliteDb();
  const dayKey = data.dayKey ?? todayDate();
  const res = sqlite.prepare("INSERT INTO notifications (type, severity, title, message, nurseId, relatedEntityType, relatedEntityId, dayKey) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(
    data.type, data.severity, data.title, data.message ?? null, data.nurseId ?? null, data.relatedEntityType ?? null, data.relatedEntityId ?? null, dayKey
  );
  return Number(res.lastInsertRowid);
}

export async function createNotificationsBatch(data: Array<{ type: string; severity: string; title: string; message?: string; nurseId?: number | null; relatedEntityType?: string; relatedEntityId?: number | null; dayKey?: string }>): Promise<void> {
  if (data.length === 0) return;
  const db = await getDb();
  if (db) {
    const rows = data.map((d) => {
      const dayKey = d.dayKey != null ? new Date(d.dayKey + "T00:00:00") : new Date(todayDate().slice(0, 10) + "T00:00:00");
      return sql`(${d.type}, ${d.severity}, ${d.title}, ${d.message ?? null}, ${d.nurseId ?? null}, ${d.relatedEntityType ?? null}, ${d.relatedEntityId ?? null}, ${dayKey})`;
    });
    await db.execute(sql`
      INSERT IGNORE INTO ${notifications}
      (type, severity, title, message, nurseId, relatedEntityType, relatedEntityId, dayKey)
      VALUES ${sql.join(rows, sql`, `)}
    `);
    return;
  }
  const sqlite = getSqliteDb();
  const insert = sqlite.prepare("INSERT INTO notifications (type, severity, title, message, nurseId, relatedEntityType, relatedEntityId, dayKey) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
  const insertAll = sqlite.transaction((rows: typeof data) => {
    for (const d of rows) {
      insert.run(d.type, d.severity, d.title, d.message ?? null, d.nurseId ?? null, d.relatedEntityType ?? null, d.relatedEntityId ?? null, d.dayKey ?? todayDate());
    }
  });
  insertAll(data);
}

export async function markNotificationRead(id: number) {
  const db = await getDb();
  if (db) {
    await db.update(notifications).set({ readAt: new Date() }).where(eq(notifications.id, id));
    return;
  }
  const sqlite = getSqliteDb();
  sqlite.prepare("UPDATE notifications SET readAt = CURRENT_TIMESTAMP WHERE id = ?").run(id);
}

export async function markAllNotificationsRead() {
  const db = await getDb();
  if (db) {
    await db.update(notifications).set({ readAt: new Date() }).where(isNull(notifications.readAt));
    return;
  }
  const sqlite = getSqliteDb();
  sqlite.prepare("UPDATE notifications SET readAt = CURRENT_TIMESTAMP WHERE readAt IS NULL").run();
}

/* ---------------- Activity log ---------------- */
export async function logActivity(data: { supervisorId?: number | null; nurseId?: number | null; actionType: string; entityType?: string; entityId?: number | null; summary: string; metadata?: Record<string, unknown> | null }) {
  const db = await getDb();
  if (db) {
    await db.insert(activityLog).values(data);
    return;
  }
  const sqlite = getSqliteDb();
  sqlite.prepare("INSERT INTO activityLog (supervisorId, nurseId, actionType, entityType, entityId, summary, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
    data.supervisorId ?? null, data.nurseId ?? null, data.actionType, data.entityType ?? null, data.entityId ?? null, data.summary, data.metadata ? JSON.stringify(data.metadata) : null
  );
}

export async function listActivityForNurse(nurseId: number) {
  const db = await getDb();
  if (db) return await db.select().from(activityLog).where(eq(activityLog.nurseId, nurseId)).orderBy(desc(activityLog.createdAt)).limit(200);
  const sqlite = getSqliteDb();
  return sqlite.prepare("SELECT * FROM activityLog WHERE nurseId = ? ORDER BY date(createdAt) DESC LIMIT 200").all(nurseId) as any[];
}

/* ---------------- Settings ---------------- */
export async function getSetting(key: string): Promise<string | null> {
  const db = await getDb();
  if (db) {
    const rows = await db.select().from(appSettings).where(eq(appSettings.key, key)).limit(1);
    return rows[0]?.value ?? null;
  }
  const sqlite = getSqliteDb();
  const row = sqlite.prepare("SELECT value FROM appSettings WHERE key = ?").get(key) as any;
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string | null) {
  const db = await getDb();
  if (db) {
    await db.insert(appSettings).values({ key, value }).onDuplicateKeyUpdate({ set: { value } });
    return;
  }
  const sqlite = getSqliteDb();
  sqlite.prepare("INSERT INTO appSettings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
}

export async function getAllSettings() {
  const db = await getDb();
  if (db) return await db.select().from(appSettings);
  const sqlite = getSqliteDb();
  return sqlite.prepare("SELECT * FROM appSettings").all() as any[];
}

/* ---------------- Aggregates ---------------- */
export async function countActiveNurses(today?: Date) {
  const db = await getDb();
  if (db) {
    const rows = await db.select({ count: sql<number>`count(*)` }).from(nurses).where(activeNurseCondition());
    return Number(rows[0]?.count ?? 0);
  }
  const sqlite = getSqliteDb();
  const row = sqlite.prepare(`SELECT count(*) as count FROM nurses WHERE archivedAt IS NULL AND employmentStatus NOT IN (${INACTIVE_STATUS_SQL_LIST})`).get() as { count: number };
  return row.count;
}
