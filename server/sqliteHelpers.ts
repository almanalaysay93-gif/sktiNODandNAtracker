import { getSqliteDb } from "./localDb";
import { daysUntilExpiry, deriveLicenseStatus, todayDate, dateKey, nurseFullName, durationBetween, trainingCompliance, STAFF_TYPES, TARGET_STAFF_TYPES, PARTICIPATION_ROLES, INACTIVE_EMPLOYMENT_STATUSES } from "../shared/nursetrack";

const INACTIVE_STATUS_SQL_LIST = INACTIVE_EMPLOYMENT_STATUSES.map((s) => `'${s}'`).join(", ");

export function getLocalDashboardInitial() {
  const sqlite = getSqliteDb();
  const today = todayDate();

  // Summary counts
  const activeRow = sqlite.prepare(`SELECT count(*) as count FROM nurses WHERE archivedAt IS NULL AND employmentStatus NOT IN (${INACTIVE_STATUS_SQL_LIST})`).get() as { count: number };
  const activeNurses = activeRow.count;

  const creds = sqlite.prepare(`
    SELECT c.expiryDate, n.archivedAt 
    FROM nurseCredentials c 
    INNER JOIN nurses n ON n.id = c.nurseId
  `).all() as { expiryDate: string; archivedAt: string | null }[];

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

  const trainings = sqlite.prepare(`
    SELECT t.status, t.scheduledDate, t.expiryDate, n.archivedAt
    FROM nurseTrainings t
    INNER JOIN nurses n ON n.id = t.nurseId
  `).all() as { status: string; scheduledDate: string | null; expiryDate: string | null; archivedAt: string | null }[];

  let trainingsAttention = 0;
  for (const t of trainings) {
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

  // Area Snapshots
  const areaRows = sqlite.prepare("SELECT * FROM areas ORDER BY sortOrder ASC").all() as any[];
  const nurseCounts = sqlite.prepare(`SELECT currentAreaId as areaId, count(*) as count FROM nurses WHERE archivedAt IS NULL AND employmentStatus NOT IN (${INACTIVE_STATUS_SQL_LIST}) GROUP BY currentAreaId`).all() as { areaId: number; count: number }[];
  const countByArea = new Map(nurseCounts.map((r) => [r.areaId ?? 0, r.count]));

  const areaSnapshots = areaRows.map((a) => ({
    ...a,
    nurseCount: countByArea.get(a.id) ?? 0,
    licenseAttention: 0,
    trainingAttention: 0,
    samplePhotos: [],
  }));

  // Action Center Items
  const credsList = sqlite.prepare(`
    SELECT c.id, c.nurseId, c.expiryDate, c.renewalStatus, n.firstName, n.lastName
    FROM nurseCredentials c
    INNER JOIN nurses n ON n.id = c.nurseId
    WHERE n.archivedAt IS NULL
  `).all() as any[];

  const items: any[] = [];
  for (const c of credsList) {
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

  // Activity Feed
  const feedRows = sqlite.prepare("SELECT * FROM activityLog ORDER BY createdAt DESC LIMIT 20").all() as any[];
  const activityFeed = feedRows.map((r) => ({
    ...r,
    nurse: null,
  }));

  // Upcoming
  const upcomingLicenses = sqlite.prepare(`
    SELECT c.id, c.nurseId, c.expiryDate, (n.firstName || ' ' || n.lastName) as nurseName
    FROM nurseCredentials c
    INNER JOIN nurses n ON n.id = c.nurseId
    WHERE n.archivedAt IS NULL AND date(c.expiryDate) >= date('now')
    ORDER BY date(c.expiryDate) ASC
    LIMIT 10
  `).all() as any[];

  const upcoming = {
    upcomingCustoms: [],
    upcomingLicenses: upcomingLicenses.map((r) => ({
      ...r,
      date: dateKey(r.expiryDate),
      daysRemaining: daysUntilExpiry(dateKey(r.expiryDate), today),
    })),
  };

  return { summary, actionCenter, areaSnapshots, activityFeed, upcoming };
}

export function getLocalSeminarsList(input?: { from?: Date | string; to?: Date | string }) {
  const sqlite = getSqliteDb();
  let sql = `
    SELECT e.*, c.id as c_id, c.name as c_name, c.category as c_category, c.kind as c_kind
    FROM trainingEvents e
    INNER JOIN trainingCatalog c ON c.id = e.trainingId
    ORDER BY date(e.startDate) DESC, c.name ASC
  `;
  const rows = sqlite.prepare(sql).all() as any[];
  
  const records = sqlite.prepare("SELECT eventId, status FROM nurseTrainings WHERE eventId IS NOT NULL").all() as { eventId: number; status: string }[];
  const counts = new Map<number, { total: number; completed: number }>();
  for (const record of records) {
    const count = counts.get(record.eventId) ?? { total: 0, completed: 0 };
    count.total++;
    if (record.status === "Completed") count.completed++;
    counts.set(record.eventId, count);
  }

  return rows.map((r) => ({
    event: {
      id: r.id,
      trainingId: r.trainingId,
      provider: r.provider,
      venue: r.venue,
      startDate: r.startDate,
      endDate: r.endDate,
      startTime: r.startTime,
      endTime: r.endTime,
      targetStaffType: r.targetStaffType,
      remarks: r.remarks,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    },
    training: {
      id: r.c_id,
      name: r.c_name,
      category: r.c_category,
      kind: r.c_kind,
    },
    attendance: counts.get(r.id) ?? { total: 0, completed: 0 },
  }));
}

export function getLocalSeminarDetail(eventId: number) {
  const sqlite = getSqliteDb();
  const eventRow = sqlite.prepare(`
    SELECT e.*, c.id as c_id, c.name as c_name, c.category as c_category, c.kind as c_kind
    FROM trainingEvents e
    INNER JOIN trainingCatalog c ON c.id = e.trainingId
    WHERE e.id = ?
  `).get(eventId) as any;

  if (!eventRow) return null;

  const event = {
    id: eventRow.id,
    trainingId: eventRow.trainingId,
    provider: eventRow.provider,
    venue: eventRow.venue,
    startDate: eventRow.startDate,
    endDate: eventRow.endDate,
    startTime: eventRow.startTime,
    endTime: eventRow.endTime,
    targetStaffType: eventRow.targetStaffType,
    remarks: eventRow.remarks,
    createdAt: eventRow.createdAt,
    updatedAt: eventRow.updatedAt,
  };
  const training = {
    id: eventRow.c_id,
    name: eventRow.c_name,
    category: eventRow.c_category,
    kind: eventRow.c_kind,
  };

  const records = sqlite.prepare(`
    SELECT t.*, n.firstName, n.middleName, n.lastName, n.suffix, n.staffType, n.currentAreaId, a.name as areaName
    FROM nurseTrainings t
    INNER JOIN nurses n ON n.id = t.nurseId
    LEFT JOIN areas a ON a.id = n.currentAreaId
    WHERE t.eventId = ?
    ORDER BY date(t.completionDate) DESC
  `).all(eventId) as any[];

  const attendees = records.map((r) => ({
    ...r,
    staffName: nurseFullName(r),
    staffType: r.staffType,
    areaName: r.areaName ?? "Unassigned",
  }));

  const allRecords = sqlite.prepare(`
    SELECT t.*, n.firstName, n.middleName, n.lastName, n.suffix, n.staffType, n.currentAreaId, a.name as areaName, e.startDate as occStartDate, e.endDate as occEndDate
    FROM nurseTrainings t
    INNER JOIN nurses n ON n.id = t.nurseId
    LEFT JOIN areas a ON a.id = n.currentAreaId
    LEFT JOIN trainingEvents e ON e.id = t.eventId
    WHERE t.trainingId = ?
    ORDER BY date(t.completionDate) DESC
  `).all(training.id) as any[];

  const allAttendees = allRecords.map((r) => ({
    ...r,
    staffName: nurseFullName(r),
    staffType: r.staffType,
    areaName: r.areaName ?? "Unassigned",
    occurrenceStartDate: r.occStartDate ?? r.scheduledDate,
    occurrenceEndDate: r.occEndDate ?? r.scheduledDate,
  }));

  const staff = sqlite.prepare(`
    SELECT n.*, a.name as areaName
    FROM nurses n
    LEFT JOIN areas a ON a.id = n.currentAreaId
    WHERE n.archivedAt IS NULL AND n.employmentStatus = 'Active'
    ORDER BY n.lastName ASC, n.firstName ASC
  `).all() as any[];

  const completedIds = new Set(attendees.filter((a) => a.status === "Completed").map((a) => a.nurseId));
  const missing = staff
    .filter((p) => event.targetStaffType === "All" || p.staffType === event.targetStaffType)
    .filter((p) => !completedIds.has(p.id))
    .map((p) => ({
      id: p.id,
      staffName: nurseFullName(p),
      staffType: p.staffType,
      areaName: p.areaName ?? "Unassigned",
    }));

  return { event, training, attendees, allAttendees, missing };
}

export function getLocalSeminarMatrix(opts?: { staffType?: string; areaId?: number }) {
  const sqlite = getSqliteDb();
  let staffSql = "SELECT n.*, a.name as areaName FROM nurses n LEFT JOIN areas a ON a.id = n.currentAreaId WHERE n.archivedAt IS NULL AND n.employmentStatus = 'Active'";
  const staffParams: any[] = [];
  if (opts?.staffType && opts.staffType !== "all") {
    staffSql += " AND n.staffType = ?";
    staffParams.push(opts.staffType);
  }
  if (opts?.areaId) {
    staffSql += " AND n.currentAreaId = ?";
    staffParams.push(opts.areaId);
  }
  staffSql += " ORDER BY n.lastName ASC, n.firstName ASC";
  const staff = sqlite.prepare(staffSql).all(...staffParams) as any[];

  const events = sqlite.prepare(`
    SELECT e.*, c.id as c_id, c.name as c_name, c.category as c_category, c.kind as c_kind
    FROM trainingEvents e
    INNER JOIN trainingCatalog c ON c.id = e.trainingId
    ORDER BY date(e.startDate) ASC, c.name ASC
  `).all() as any[];

  const records = sqlite.prepare("SELECT * FROM nurseTrainings WHERE eventId IS NOT NULL").all() as any[];

  return {
    staff: staff.map((p) => ({ id: p.id, name: nurseFullName(p), staffType: p.staffType, areaId: p.currentAreaId })),
    events: events.map((r) => ({
      event: { id: r.id, trainingId: r.trainingId, startDate: r.startDate, endDate: r.endDate },
      training: { id: r.c_id, name: r.c_name, kind: r.c_kind },
    })),
    records,
  };
}

export function getLocalMonthlySummary(year: number) {
  const sqlite = getSqliteDb();
  const staff = sqlite.prepare("SELECT * FROM nurses WHERE archivedAt IS NULL AND employmentStatus = 'Active' ORDER BY lastName ASC, firstName ASC").all() as any[];
  const records = sqlite.prepare("SELECT nurseId, completionDate FROM nurseTrainings WHERE status = 'Completed' AND completionDate IS NOT NULL").all() as { nurseId: number; completionDate: string }[];

  return staff.map((person) => {
    const months = Array.from({ length: 12 }, () => 0);
    for (const record of records) {
      if (record.nurseId !== person.id) continue;
      const key = dateKey(record.completionDate);
      if (Number(key.slice(0, 4)) === year) {
        const m = Number(key.slice(5, 7)) - 1;
        if (m >= 0 && m < 12) months[m]++;
      }
    }
    return {
      nurseId: person.id,
      staffName: nurseFullName(person),
      months,
      h1: months.slice(0, 6).reduce((a, b) => a + b, 0),
      h2: months.slice(6).reduce((a, b) => a + b, 0),
    };
  });
}

export function getLocalQuarterlyLedger(year: number, quarter: number) {
  const sqlite = getSqliteDb();
  const startMonth = String((quarter - 1) * 3 + 1).padStart(2, "0");
  const endMonth = String(quarter * 3).padStart(2, "0");
  const from = `${year}-${startMonth}-01`;
  const to = `${year}-${endMonth}-31`;

  const rows = sqlite.prepare(`
    SELECT t.*, n.firstName, n.middleName, n.lastName, n.suffix, c.name as trainingName, c.kind as trainingKind, e.startDate as evStart, e.endDate as evEnd, e.venue as evVenue, e.provider as evProvider
    FROM nurseTrainings t
    INNER JOIN nurses n ON n.id = t.nurseId
    INNER JOIN trainingCatalog c ON c.id = t.trainingId
    LEFT JOIN trainingEvents e ON e.id = t.eventId
    WHERE t.status = 'Completed' AND date(t.completionDate) >= date(?) AND date(t.completionDate) <= date(?)
    ORDER BY date(t.completionDate) ASC, n.lastName ASC
  `).all(from, to) as any[];

  return rows.map((r) => ({
    recordId: r.id,
    nurseId: r.nurseId,
    staffName: nurseFullName(r),
    trainingName: r.trainingName,
    kind: r.trainingKind,
    provider: r.evProvider ?? r.provider,
    venue: r.evVenue ?? null,
    startDate: r.evStart ?? dateKey(r.completionDate),
    endDate: r.evEnd ?? dateKey(r.completionDate),
    completionDate: dateKey(r.completionDate),
    participationRole: r.participationRole,
  }));
}

export function getLocalReportData(type: string) {
  const sqlite = getSqliteDb();
  const today = todayDate();

  if (type === "licenseStatus") {
    const rows = sqlite.prepare(`
      SELECT n.employeeId, n.firstName, n.middleName, n.lastName, n.suffix, n.currentAreaId, a.name as areaName,
             c.id as credentialId, c.licenseNumber, ct.name as typeName, c.issuingOrganization, c.issueDate, c.expiryDate, c.renewalStatus, c.verificationStatus
      FROM nurseCredentials c
      INNER JOIN nurses n ON n.id = c.nurseId
      INNER JOIN credentialTypes ct ON ct.id = c.credentialTypeId
      LEFT JOIN areas a ON a.id = n.currentAreaId
      WHERE n.archivedAt IS NULL
      ORDER BY n.lastName ASC, n.firstName ASC
    `).all() as any[];

    return rows.map((r) => ({
      nurse: nurseFullName(r),
      employeeId: r.employeeId,
      areaName: r.areaName ?? "Unassigned",
      credentialType: r.typeName,
      licenseNumber: r.licenseNumber ?? "—",
      issuingOrganization: r.issuingOrganization ?? "—",
      issueDate: r.issueDate ? String(r.issueDate) : "—",
      expiryDate: dateKey(r.expiryDate),
      daysRemaining: daysUntilExpiry(dateKey(r.expiryDate), today),
      status: deriveLicenseStatus(dateKey(r.expiryDate), today),
      renewalStatus: r.renewalStatus,
      verificationStatus: r.verificationStatus,
    }));
  }

  if (type === "licenseDue") {
    const rows = sqlite.prepare(`
      SELECT n.employeeId, n.firstName, n.middleName, n.lastName, n.suffix, n.currentAreaId, a.name as areaName,
             c.id as credentialId, c.licenseNumber, ct.name as typeName, c.issuingOrganization, c.expiryDate, c.renewalStatus
      FROM nurseCredentials c
      INNER JOIN nurses n ON n.id = c.nurseId
      INNER JOIN credentialTypes ct ON ct.id = c.credentialTypeId
      LEFT JOIN areas a ON a.id = n.currentAreaId
      WHERE n.archivedAt IS NULL
      ORDER BY date(c.expiryDate) ASC
    `).all() as any[];

    return rows
      .filter((r) => daysUntilExpiry(dateKey(r.expiryDate), today) <= 365)
      .map((r) => ({
        nurse: nurseFullName(r),
        employeeId: r.employeeId,
        areaName: r.areaName ?? "Unassigned",
        credentialType: r.typeName,
        licenseNumber: r.licenseNumber ?? "—",
        issuingOrganization: r.issuingOrganization ?? "—",
        expiryDate: dateKey(r.expiryDate),
        daysRemaining: daysUntilExpiry(dateKey(r.expiryDate), today),
        status: deriveLicenseStatus(dateKey(r.expiryDate), today),
        renewalStatus: r.renewalStatus,
      }));
  }

  if (type === "areaExposure") {
    const rows = sqlite.prepare(`
      SELECT n.employeeId,
             (SELECT c.licenseNumber FROM nurseCredentials c WHERE c.nurseId = n.id ORDER BY date(c.expiryDate) DESC LIMIT 1) as licenseNumber,
             n.firstName, n.middleName, n.lastName, n.suffix,
             a.name as areaName, asgn.startDate, asgn.endDate, asgn.assignmentType
      FROM areaAssignments asgn
      INNER JOIN nurses n ON n.id = asgn.nurseId
      INNER JOIN areas a ON a.id = asgn.areaId
      WHERE n.archivedAt IS NULL
      ORDER BY n.lastName ASC, n.firstName ASC, date(asgn.startDate) ASC
    `).all() as any[];

    return rows.map((r) => ({
      nurse: nurseFullName(r),
      employeeId: r.licenseNumber || r.employeeId,
      areaName: r.areaName,
      startDate: dateKey(r.startDate),
      endDate: r.endDate ? dateKey(r.endDate) : "Present",
      assignmentType: r.assignmentType ?? "—",
      durationDays: durationBetween(dateKey(r.startDate), r.endDate ? dateKey(r.endDate) : today),
    }));
  }

  if (type === "trainingSummary") {
    const rows = sqlite.prepare(`
      SELECT c.name as trainingName, c.category, c.renewalRequired, c.defaultValidityMonths,
             n.firstName, n.middleName, n.lastName, n.suffix,
             t.status, t.scheduledDate, t.completionDate, t.expiryDate, t.trainingHours, t.cpdUnits, t.provider
      FROM nurseTrainings t
      INNER JOIN trainingCatalog c ON c.id = t.trainingId
      INNER JOIN nurses n ON n.id = t.nurseId
      WHERE n.archivedAt IS NULL
      ORDER BY c.name ASC, date(t.completionDate) DESC
    `).all() as any[];

    return rows.map((r) => ({
      nurse: nurseFullName(r),
      trainingName: r.trainingName,
      category: r.category ?? "—",
      renewalRequired: r.renewalRequired === 1,
      defaultValidityMonths: r.defaultValidityMonths ?? null,
      status: r.status,
      scheduledDate: r.scheduledDate ? dateKey(r.scheduledDate) : "—",
      completionDate: r.completionDate ? dateKey(r.completionDate) : "—",
      expiryDate: r.expiryDate ? dateKey(r.expiryDate) : "—",
      trainingHours: r.trainingHours ?? null,
      cpdUnits: r.cpdUnits ?? null,
      provider: r.provider ?? "—",
    }));
  }

  if (type === "transferLog") {
    const rows = sqlite.prepare(`
      SELECT n.employeeId,
             (SELECT c.licenseNumber FROM nurseCredentials c WHERE c.nurseId = n.id ORDER BY date(c.expiryDate) DESC LIMIT 1) as licenseNumber,
             n.firstName, n.middleName, n.lastName, n.suffix,
             a.name as areaName, asgn.startDate, asgn.endDate, asgn.assignmentType, asgn.remarks
      FROM areaAssignments asgn
      INNER JOIN nurses n ON n.id = asgn.nurseId
      INNER JOIN areas a ON a.id = asgn.areaId
      ORDER BY date(asgn.startDate) ASC, n.lastName ASC
    `).all() as any[];

    return rows.map((r) => ({
      nurse: nurseFullName(r),
      employeeId: r.licenseNumber || r.employeeId,
      areaName: r.areaName,
      startDate: dateKey(r.startDate),
      endDate: r.endDate ? dateKey(r.endDate) : "Present",
      assignmentType: r.assignmentType ?? "—",
      remarks: r.remarks ?? "—",
    }));
  }

  return [];
}
