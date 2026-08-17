import {
  boolean,
  date,
  datetime,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow (Manus OAuth).
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
    dateHired: date("dateHired"),
    employmentStatus: mysqlEnum("employmentStatus", [
      "Active",
      "On Leave",
      "Temporary Assignment",
      "Transferred",
      "Resigned",
      "Retired",
      "Archived",
    ])
      .default("Active")
      .notNull(),
    currentAreaId: int("currentAreaId"),
    profilePhotoKey: text("profilePhotoKey"),
    archivedAt: timestamp("archivedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => ({
    idxEmployee: uniqueIndex("idx_nurses_employee").on(t.employeeId),
    idxLastName: uniqueIndex("idx_nurses_lastname").on(t.lastName),
    idxArea: uniqueIndex("idx_nurses_area").on(t.currentAreaId),
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
    idxNurse: uniqueIndex("idx_asgn_nurse").on(t.nurseId),
    idxArea: uniqueIndex("idx_asgn_area").on(t.areaId),
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
    idxNurse: uniqueIndex("idx_cred_nurse").on(t.nurseId),
    idxExpiry: uniqueIndex("idx_cred_expiry").on(t.expiryDate),
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
  renewalRequired: boolean("renewalRequired").default(false).notNull(),
  defaultValidityMonths: int("defaultValidityMonths"),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type TrainingCatalog = typeof trainingCatalog.$inferSelect;

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
    idxNurse: uniqueIndex("idx_nt_nurse").on(t.nurseId),
    idxExpiry: uniqueIndex("idx_nt_expiry").on(t.expiryDate),
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
    idxDate: uniqueIndex("idx_cce_date").on(t.eventDate),
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
    idxRead: uniqueIndex("idx_notif_read").on(t.readAt),
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
    idxNurse: uniqueIndex("idx_activity_nurse").on(t.nurseId),
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
