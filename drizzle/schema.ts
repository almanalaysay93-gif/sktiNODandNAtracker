import {
  boolean,
  date,
  datetime,
  int,
  index,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow (Google OAuth).
 * Single supervisor role in v1 — the supervisor is the account owner.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/** Areas of assignment (RDU MAIN, RDU ANNEX, SKTI SERVICE WARD, SKTI ICU, SKTI PAY). */
export const areas = mysqlTable("areas", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 128 }).notNull().unique(),
  description: text("description"),
  sortOrder: int("sortOrder").default(99).notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type Area = typeof areas.$inferSelect;
export type InsertArea = typeof areas.$inferInsert;

/** Nurse staff records. Never hard-deleted; archived nurses are flagged. */
export const nurses = mysqlTable(
  "nurses",
  {
    id: int("id").autoincrement().primaryKey(),
    employeeId: varchar("employeeId", { length: 64 }).notNull().unique(),
    firstName: varchar("firstName", { length: 128 }).notNull(),
    middleName: varchar("middleName", { length: 128 }),
    lastName: varchar("lastName", { length: 128 }).notNull(),
    suffix: varchar("suffix", { length: 32 }),
    position: varchar("position", { length: 128 }),
    staffType: mysqlEnum("staffType", ["Registered Nurse", "Nursing Attendant"])
      .default("Registered Nurse")
      .notNull(),
    dateHired: date("dateHired"),
    employmentStatus: mysqlEnum("employmentStatus", [
      "Active",
      "On Leave",
      "Temporary Assignment",
      "Transferred",
      "Rotated",
      "Resigned",
      "Retired",
      "Archived",
    ])
      .default("Active")
      .notNull(),
    currentAreaId: int("currentAreaId"),
    profilePhotoKey: text("profilePhotoKey"),
    contactNumber: varchar("contactNumber", { length: 32 }),
    /** Google account email used to self-link this nurse's staff self-service login. Not the HR record of truth — just the login identity. */
    accountEmail: varchar("accountEmail", { length: 320 }),
    /** users.id of the linked Google account, once the staff member has linked (via supervisor pre-fill or self-link by PRC number + name). Null = not linked yet. */
    linkedUserId: int("linkedUserId"),
    archivedAt: timestamp("archivedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => ({
    idxEmployee: uniqueIndex("idx_nurses_employee").on(t.employeeId),
    idxLastName: index("idx_nurses_lastname").on(t.lastName),
    idxArea: index("idx_nurses_area").on(t.currentAreaId),
    idxLinkedUser: uniqueIndex("idx_nurses_linked_user").on(t.linkedUserId),
  }),
);
export type Nurse = typeof nurses.$inferSelect;
export type InsertNurse = typeof nurses.$inferInsert;

/** Historical area assignments. Never destroyed on area changes. */
export const areaAssignments = mysqlTable(
  "areaAssignments",
  {
    id: int("id").autoincrement().primaryKey(),
    nurseId: int("nurseId").notNull(),
    areaId: int("areaId").notNull(),
    startDate: date("startDate").notNull(),
    endDate: date("endDate"),
    assignmentType: varchar("assignmentType", { length: 64 }),
    remarks: text("remarks"),
    isCurrent: boolean("isCurrent").default(false).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => ({
    idxNurse: index("idx_asgn_nurse").on(t.nurseId),
    idxArea: index("idx_asgn_area").on(t.areaId),
  }),
);
export type AreaAssignment = typeof areaAssignments.$inferSelect;

/** Credential types — PRC Registered Nurse License seeded by default. */
export const credentialTypes = mysqlTable("credentialTypes", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 128 }).notNull().unique(),
  issuingOrganizationDefault: text("issuingOrganizationDefault"),
  active: boolean("active").default(true).notNull(),
});
export type CredentialType = typeof credentialTypes.$inferSelect;

/** Professional license / credential records. */
export const nurseCredentials = mysqlTable(
  "nurseCredentials",
  {
    id: int("id").autoincrement().primaryKey(),
    nurseId: int("nurseId").notNull(),
    credentialTypeId: int("credentialTypeId").notNull(),
    licenseNumber: varchar("licenseNumber", { length: 64 }),
    issuingOrganization: varchar("issuingOrganization", { length: 128 }),
    issueDate: date("issueDate"),
    expiryDate: date("expiryDate").notNull(),
    renewalStatus: mysqlEnum("renewalStatus", [
      "Not Started",
      "Renewal In Progress",
      "Submitted",
      "Renewed",
    ])
      .default("Not Started")
      .notNull(),
    verificationStatus: mysqlEnum("verificationStatus", [
      "Unverified",
      "Pending Verification",
      "Verified",
    ])
      .default("Unverified")
      .notNull(),
    documentKey: text("documentKey"),
    renewalCycleKey: varchar("renewalCycleKey", { length: 128 }).notNull(),
    remarks: text("remarks"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => ({
    idxNurse: index("idx_cred_nurse").on(t.nurseId),
    idxExpiry: index("idx_cred_expiry").on(t.expiryDate),
  }),
);
export type NurseCredential = typeof nurseCredentials.$inferSelect;

/** Automated license renewal reminders (one per credential + threshold + cycle). */
export const licenseReminders = mysqlTable(
  "licenseReminders",
  {
    id: int("id").autoincrement().primaryKey(),
    credentialId: int("credentialId").notNull(),
    thresholdDays: int("thresholdDays").notNull(),
    renewalCycleKey: varchar("renewalCycleKey", { length: 128 }).notNull(),
    triggerDate: date("triggerDate").notNull(),
    generatedAt: timestamp("generatedAt").defaultNow().notNull(),
    acknowledgedAt: timestamp("acknowledgedAt"),
    status: mysqlEnum("status", ["active", "acknowledged", "expired"]).default("active").notNull(),
  },
  (t) => ({
    uniqCycle: uniqueIndex("uniq_reminder_cycle").on(t.credentialId, t.thresholdDays, t.renewalCycleKey),
  }),
);
export type LicenseReminder = typeof licenseReminders.$inferSelect;

/** Training catalog types. */
export const trainingCatalog = mysqlTable("trainingCatalog", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 128 }).notNull().unique(),
  category: varchar("category", { length: 64 }),
  kind: mysqlEnum("kind", ["Training", "Seminar", "LDI"]).default("Training").notNull(),
  renewalRequired: boolean("renewalRequired").default(false).notNull(),
  defaultValidityMonths: int("defaultValidityMonths"),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type TrainingCatalog = typeof trainingCatalog.$inferSelect;

/** Scheduled seminar/LDI occurrence. A catalog item may run on multiple dates. */
export const trainingEvents = mysqlTable(
  "trainingEvents",
  {
    id: int("id").autoincrement().primaryKey(),
    trainingId: int("trainingId").notNull(),
    provider: varchar("provider", { length: 128 }),
    venue: varchar("venue", { length: 256 }),
    startDate: date("startDate").notNull(),
    endDate: date("endDate").notNull(),
    startTime: varchar("startTime", { length: 8 }),
    endTime: varchar("endTime", { length: 8 }),
    targetStaffType: mysqlEnum("targetStaffType", ["All", "Registered Nurse", "Nursing Attendant"])
      .default("All")
      .notNull(),
    remarks: text("remarks"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => ({
    idxTrainingDate: index("idx_training_event_date").on(t.trainingId, t.startDate),
  }),
);
export type TrainingEvent = typeof trainingEvents.$inferSelect;

/** Which trainings are required for which areas. */
export const areaTrainingRequirements = mysqlTable(
  "areaTrainingRequirements",
  {
    id: int("id").autoincrement().primaryKey(),
    areaId: int("areaId").notNull(),
    trainingId: int("trainingId").notNull(),
    required: boolean("required").default(true).notNull(),
  },
  (t) => ({
    uniqReq: uniqueIndex("uniq_area_training_req").on(t.areaId, t.trainingId),
  }),
);
export type AreaTrainingRequirement = typeof areaTrainingRequirements.$inferSelect;

/** Nurse training records (each renewal = new record). */
export const nurseTrainings = mysqlTable(
  "nurseTrainings",
  {
    id: int("id").autoincrement().primaryKey(),
    nurseId: int("nurseId").notNull(),
    trainingId: int("trainingId").notNull(),
    eventId: int("eventId"),
    participationRole: mysqlEnum("participationRole", ["Participant", "Speaker", "Facilitator", "Preceptor"])
      .default("Participant")
      .notNull(),
    provider: varchar("provider", { length: 128 }),
    status: mysqlEnum("status", ["Scheduled", "Completed", "Expired", "Cancelled"]).default("Scheduled").notNull(),
    scheduledDate: date("scheduledDate"),
    completionDate: date("completionDate"),
    expiryDate: date("expiryDate"),
    trainingHours: int("trainingHours"),
    cpdUnits: int("cpdUnits"),
    certificateNumber: varchar("certificateNumber", { length: 64 }),
    certificateKey: text("certificateKey"),
    remarks: text("remarks"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => ({
    idxNurse: index("idx_nt_nurse").on(t.nurseId),
    idxTraining: index("idx_nt_training").on(t.trainingId),
    idxEvent: index("idx_nt_event").on(t.eventId),
    uniqEventNurse: uniqueIndex("uniq_nt_event_nurse").on(t.eventId, t.nurseId),
    idxExpiry: index("idx_nt_expiry").on(t.expiryDate),
  }),
);
export type NurseTraining = typeof nurseTrainings.$inferSelect;

/** Supervisor-created custom calendar events. */
export const customCalendarEvents = mysqlTable(
  "customCalendarEvents",
  {
    id: int("id").autoincrement().primaryKey(),
    title: varchar("title", { length: 256 }).notNull(),
    eventDate: date("eventDate").notNull(),
    startTime: varchar("startTime", { length: 8 }), // HH:mm
    endTime: varchar("endTime", { length: 8 }),
    allDay: boolean("allDay").default(true).notNull(),
    nurseId: int("nurseId"),
    areaId: int("areaId"),
    description: text("description"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => ({
    idxDate: index("idx_cce_date").on(t.eventDate),
  }),
);
export type CustomCalendarEvent = typeof customCalendarEvents.$inferSelect;

/** In-app notifications generated by automation or actions. */
export const notifications = mysqlTable(
  "notifications",
  {
    id: int("id").autoincrement().primaryKey(),
    type: varchar("type", { length: 64 }).notNull(),
    severity: varchar("severity", { length: 32 }).notNull(),
    title: varchar("title", { length: 256 }).notNull(),
    message: text("message"),
    nurseId: int("nurseId"),
    relatedEntityType: varchar("relatedEntityType", { length: 64 }),
    relatedEntityId: int("relatedEntityId"),
    readAt: timestamp("readAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    dayKey: date("dayKey"),
  },
  (t) => ({
    idxRead: index("idx_notif_read").on(t.readAt),
    uniqDay: uniqueIndex("uniq_notif_day").on(t.type, t.nurseId, t.relatedEntityType, t.relatedEntityId, t.dayKey),
  }),
);
export type Notification = typeof notifications.$inferSelect;

/** Audit trail for important record changes. */
export const activityLog = mysqlTable(
  "activityLog",
  {
    id: int("id").autoincrement().primaryKey(),
    supervisorId: int("supervisorId"),
    nurseId: int("nurseId"),
    actionType: varchar("actionType", { length: 64 }).notNull(),
    entityType: varchar("entityType", { length: 64 }),
    entityId: int("entityId"),
    summary: text("summary").notNull(),
    metadata: json("metadata"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => ({
    idxNurse: index("idx_activity_nurse").on(t.nurseId),
  }),
);
export type ActivityLog = typeof activityLog.$inferSelect;

/** App settings stored as a simple key/value table. */
export const appSettings = mysqlTable("appSettings", {
  id: int("id").autoincrement().primaryKey(),
  key: varchar("key", { length: 64 }).notNull().unique(),
  value: text("value"),
});
export type AppSetting = typeof appSettings.$inferSelect;

/** Outbound email delivery ledger for audit and deduplication. */
export const emailLogs = mysqlTable(
  "emailLogs",
  {
    id: int("id").autoincrement().primaryKey(),
    nurseId: int("nurseId").notNull(),
    recipientEmail: varchar("recipientEmail", { length: 320 }).notNull(),
    emailType: varchar("emailType", { length: 64 }).notNull(),
    referenceId: int("referenceId"),
    thresholdKey: varchar("thresholdKey", { length: 64 }),
    subject: varchar("subject", { length: 256 }).notNull(),
    status: varchar("status", { length: 32 }).default("sent").notNull(),
    errorMessage: text("errorMessage"),
    sentAt: timestamp("sentAt").defaultNow().notNull(),
  },
  (t) => ({
    idxNurse: index("idx_email_nurse").on(t.nurseId),
    idxTypeRef: index("idx_email_typeref").on(t.emailType, t.referenceId),
  }),
);
export type EmailLog = typeof emailLogs.$inferSelect;
export type InsertEmailLog = typeof emailLogs.$inferInsert;
