/** Shared types for the Smart Import feature (AI file upload → structured DB draft → supervisor review → commit). */

export const SMART_IMPORT_KINDS = ["nurse", "credential", "training", "areaAssignment", "calendarEvent"] as const;
export type SmartImportKind = (typeof SMART_IMPORT_KINDS)[number];

/** Only "nurse" rows can be an update (correcting an existing profile); every other kind is additive,
 * matching the app's append-only history pattern (new credential cycle, new training record, etc). */
export function actionsForKind(kind: SmartImportKind): Array<"create" | "update"> {
  return kind === "nurse" ? ["create", "update"] : ["create"];
}

export type SmartImportFieldValue = {
  value: string | number | boolean | null;
  confidence: number; // 0-1, AI's confidence in this value
  /** For reference fields only (see REFERENCE_FIELDS) — the resolved id of the matched existing record, if any. */
  refId?: number | null;
};

/** Field keys that name an existing entity rather than hold a plain value — resolved to an id server-side,
 * rendered as a searchable picker (not free text) client-side. */
export const REFERENCE_FIELDS: Partial<Record<string, "area" | "credentialType" | "training">> = {
  areaName: "area",
  credentialTypeName: "credentialType",
  trainingName: "training",
};

/** One extracted, still-unwritten record. Field keys are kind-specific — see SMART_IMPORT_FIELDS. */
export type SmartImportRow = {
  rowId: string;
  kind: SmartImportKind;
  action: "create" | "update";
  /** Resolved nurse id — the subject nurse for credential/training/areaAssignment, or the nurse being
   * created/updated for kind="nurse". Null for calendarEvent rows with no associated nurse. */
  nurseId: number | null;
  nurseMatchConfidence: number; // 0-1, 0 when nurseId is null
  /** Free-text name the AI read off the document, kept for the supervisor to compare against the resolved match. */
  nurseNameGuess: string;
  fields: Record<string, SmartImportFieldValue>;
  sourceExcerpt: string;
  include: boolean;
};

/** Field schema per kind: key -> { label, type }. Drives both the AI extraction prompt and the review-table renderer. */
export const SMART_IMPORT_FIELDS: Record<SmartImportKind, Record<string, { label: string; type: "text" | "date" | "number" | "select" | "boolean"; options?: readonly string[] }>> = {
  nurse: {
    employeeId: { label: "Employee ID", type: "text" },
    firstName: { label: "First Name", type: "text" },
    middleName: { label: "Middle Name", type: "text" },
    lastName: { label: "Last Name", type: "text" },
    suffix: { label: "Suffix", type: "text" },
    position: { label: "Position", type: "text" },
    contactNumber: { label: "Contact Number", type: "text" },
    staffType: { label: "Staff Type", type: "select", options: ["Registered Nurse", "Nursing Attendant"] },
    dateHired: { label: "Date Hired", type: "date" },
    employmentStatus: {
      label: "Employment Status",
      type: "select",
      options: ["Active", "On Leave", "Temporary Assignment", "Transferred", "Rotated", "Resigned", "Retired", "Archived"],
    },
    areaName: { label: "Current Area", type: "text" },
  },
  credential: {
    credentialTypeName: { label: "Credential Type", type: "text" },
    licenseNumber: { label: "License Number", type: "text" },
    issuingOrganization: { label: "Issuing Organization", type: "text" },
    issueDate: { label: "Issue Date", type: "date" },
    expiryDate: { label: "Expiry Date", type: "date" },
    renewalStatus: { label: "Renewal Status", type: "select", options: ["Not Started", "Renewal In Progress", "Submitted", "Renewed"] },
    verificationStatus: { label: "Verification Status", type: "select", options: ["Unverified", "Pending Verification", "Verified"] },
    remarks: { label: "Remarks", type: "text" },
  },
  training: {
    trainingName: { label: "Training / Seminar", type: "text" },
    participationRole: { label: "Role", type: "select", options: ["Participant", "Speaker", "Facilitator", "Preceptor"] },
    provider: { label: "Provider", type: "text" },
    status: { label: "Status", type: "select", options: ["Scheduled", "Completed", "Expired", "Cancelled"] },
    scheduledDate: { label: "Scheduled Date", type: "date" },
    completionDate: { label: "Completion Date", type: "date" },
    expiryDate: { label: "Expiry Date", type: "date" },
    trainingHours: { label: "Training Hours", type: "number" },
    cpdUnits: { label: "CPD Units", type: "number" },
    certificateNumber: { label: "Certificate Number", type: "text" },
    remarks: { label: "Remarks", type: "text" },
  },
  areaAssignment: {
    areaName: { label: "Area", type: "text" },
    startDate: { label: "Start Date", type: "date" },
    endDate: { label: "End Date", type: "date" },
    assignmentType: { label: "Assignment Type", type: "text" },
    remarks: { label: "Remarks", type: "text" },
  },
  calendarEvent: {
    title: { label: "Title", type: "text" },
    eventDate: { label: "Date", type: "date" },
    startTime: { label: "Start Time", type: "text" },
    endTime: { label: "End Time", type: "text" },
    allDay: { label: "All Day", type: "boolean" },
    areaName: { label: "Area", type: "text" },
    description: { label: "Description", type: "text" },
  },
};

export const SMART_IMPORT_MAX_ROWS = 200;
export const SMART_IMPORT_DRAFT_TTL_MS = 15 * 60 * 1000;
