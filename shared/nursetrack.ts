/**
 * Shared business logic for SKTI NurseTrack.
 * Pure functions usable by server and (where sensible) client code.
 */

export type LicenseStatus = "Expired" | "Within 6 Months" | "Within 1 Year" | "Valid";
export type ReminderSeverity = "urgent_or_expired" | "upcoming_renewal" | "attention" | "informational";

/** Days remaining from today to an expiry date string (YYYY-MM-DD). Negative = expired. */
export function daysUntilExpiry(expiryDate: string | Date | null | undefined, today = todayDate()): number {
  if (!expiryDate) return -1;
  const expiry = parseLocalDate(expiryDate);
  const todayMs = parseLocalDate(today).getTime();
  return Math.floor((expiry.getTime() - todayMs) / 86400000);
}

export function todayDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function parseLocalDate(value: string | Date): Date {
  if (value instanceof Date) return value;
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Derived license status calculated purely from the expiry date.
 * Never manually typed — this is the single source of truth.
 */
export function deriveLicenseStatus(expiryDate: string | Date, today = todayDate()): LicenseStatus {
  const days = daysUntilExpiry(expiryDate, today);
  if (days < 0) return "Expired";
  if (days <= 180) return "Within 6 Months";
  if (days <= 365) return "Within 1 Year";
  return "Valid";
}

export const LICENSE_STATUS_SEVERITY: Record<LicenseStatus, ReminderSeverity> = {
  Expired: "urgent_or_expired",
  "Within 6 Months": "upcoming_renewal",
  "Within 1 Year": "attention",
  Valid: "informational",
};

export const LICENSE_STATUS_META: Record<
  LicenseStatus,
  { label: string; color: "red" | "orange" | "yellow" | "green" }
> = {
  Expired: { label: "Expired", color: "red" },
  "Within 6 Months": { label: "Within 6 Months", color: "orange" },
  "Within 1 Year": { label: "Within 1 Year", color: "yellow" },
  Valid: { label: "Valid", color: "green" },
};

/** Unique key identifying a renewal cycle for a credential record. */
export function renewalCycleKey(credentialId: number | string): string {
  return `credential-${credentialId}`;
}

/** Whether the supervisor should be reminded today for a threshold. */
export function isThresholdDue(expiryDate: string, thresholdDays: number, today = todayDate()): boolean {
  const days = daysUntilExpiry(expiryDate, today);
  return days <= thresholdDays;
}

/** Compute action-center bucket for an expiry-based item. */
export function urgencyBucket(expiryDate: string | Date | null, today = todayDate()): "urgent" | "30days" | "6months" | "1year" | null {
  if (!expiryDate) return null;
  const days = daysUntilExpiry(expiryDate, today);
  if (days < 0) return "urgent";
  if (days <= 30) return "urgent";
  if (days <= 180) return "6months";
  if (days <= 365) return "1year";
  return null;
}

/** Format a YYYY-MM-DD date for display (locale-aware). */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = parseLocalDate(value);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/** Numeric days between two dates (end defaults to today). */
export function daysBetween(start: string | Date | null | undefined, end: string | Date | null | undefined, today = todayDate()): number {
  if (!start) return 0;
  const s = parseLocalDate(start).getTime();
  const e = end ? parseLocalDate(end).getTime() : parseLocalDate(today).getTime();
  if (e < s) return 0;
  return Math.floor((e - s) / 86400000);
}

/** Human-readable duration between two dates, e.g. "2 yrs 3 mos". */
export function durationBetween(start: string | Date | null | undefined, end: string | Date | null | undefined, today = todayDate()): string {
  if (!start) return "—";
  const s = parseLocalDate(start).getTime();
  const e = end ? parseLocalDate(end).getTime() : parseLocalDate(today).getTime();
  if (e < s) return "—";
  const diffMs = e - s;
  const totalDays = Math.floor(diffMs / 86400000);
  const years = Math.floor(totalDays / 365.25);
  const months = Math.floor((totalDays - years * 365.25) / 30.44);
  if (years === 0 && months === 0) return totalDays === 0 ? "Same day" : `${totalDays} day${totalDays === 1 ? "" : "s"}`;
  const parts: string[] = [];
  if (years > 0) parts.push(`${years} yr${years === 1 ? "" : "s"}`);
  if (months > 0) parts.push(`${months} mo${months === 1 ? "" : "s"}`);
  return parts.join(" ");
}

/** Total recorded area experience for a nurse across all assignment rows. */
export function totalExperienceYears(
  assignments: { startDate: string | Date; endDate?: string | Date | null }[],
  today = todayDate(),
): number {
  let days = 0;
  for (const a of assignments) {
    const s = parseLocalDate(a.startDate).getTime();
    const e = a.endDate ? parseLocalDate(a.endDate).getTime() : parseLocalDate(today).getTime();
    if (e > s) days += Math.floor((e - s) / 86400000);
  }
  return Math.round((days / 365.25) * 10) / 10;
}

/**
 * Training compliance % for a nurse in an area.
 * = valid completed required trainings / total active required trainings for the area.
 * A completed training is "valid" when renewalRequired=false, or expiryDate is null or in the future.
 */
export function trainingCompliance(params: {
  requiredTrainingIds: number[];
  nurseTrainingRecords: { trainingId: number; status: string; expiryDate?: string | Date | null; completionDate?: string | Date | null }[];
  today?: string;
}): number {
  const { requiredTrainingIds, nurseTrainingRecords, today = todayDate() } = params;
  if (requiredTrainingIds.length === 0) return 100;
  let satisfied = 0;
  for (const tid of requiredTrainingIds) {
    const records = nurseTrainingRecords.filter((r) => r.trainingId === tid && r.status === "Completed");
    if (records.length === 0) continue;
    // A training is satisfied if any completed record is still valid (no expiry or expiry in the future).
    const hasValid = records.some((r) => {
      if (!r.expiryDate) return true;
      return daysUntilExpiry(r.expiryDate, today) > 0;
    });
    if (hasValid) satisfied++;
  }
  return Math.round((satisfied / requiredTrainingIds.length) * 100);
}

/** Full display name for a nurse. */
export function nurseFullName(n: { firstName: string; middleName?: string | null; lastName: string; suffix?: string | null }): string {
  const parts = [n.firstName];
  if (n.middleName) parts.push(n.middleName);
  parts.push(n.lastName);
  if (n.suffix) parts.push(n.suffix);
  return parts.join(" ");
}

export const ASSIGNMENT_TYPES = [
  "Permanent Transfer",
  "Temporary Assignment",
  "Rotation",
  "Training Exposure",
  "Return to Previous Area",
  "Other",
] as const;

export const EMPLOYMENT_STATUSES = [
  "Active",
  "On Leave",
  "Temporary Assignment",
  "Transferred",
  "Resigned",
  "Retired",
  "Archived",
] as const;

export const RENEWAL_STATUSES = ["Not Started", "Renewal In Progress", "Submitted", "Renewed"] as const;

export const VERIFICATION_STATUSES = ["Unverified", "Pending Verification", "Verified"] as const;

export const TRAINING_STATUSES = ["Scheduled", "Completed", "Expired", "Cancelled"] as const;

export const TRAINING_CATEGORIES = [
  "Mandatory",
  "Clinical",
  "Specialty",
  "Emergency",
  "Safety",
  "Infection Control",
  "Leadership",
  "Continuing Education",
  "Other",
] as const;

export const ALLOWED_PHOTO_MIMES = ["image/jpeg", "image/png", "image/jpg"];
export const ALLOWED_DOCUMENT_MIMES = ["image/jpeg", "image/png", "image/jpg", "application/pdf"];
export const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

/** Basic MIME validation for uploads. */
export function validateMime(mime: string | undefined, kind: "photo" | "document"): { ok: boolean; error?: string } {
  if (!mime) return { ok: false, error: "File type could not be detected." };
  const allowed = kind === "photo" ? ALLOWED_PHOTO_MIMES : ALLOWED_DOCUMENT_MIMES;
  if (!allowed.includes(mime)) return { ok: false, error: "File type not supported. Use JPG, PNG" + (kind === "document" ? " or PDF" : "") + "." };
  return { ok: true };
}

/** Sanitize a filename to avoid path issues. */
export function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100);
}

/** Storage key prefix per bucket. */
export function storageKey(bucket: "profile-photos" | "license-documents" | "certificates", nurseId: number, name: string): string {
  const safe = sanitizeFilename(name);
  const ts = Date.now();
  return `nursetrack/${bucket}/nurse-${nurseId}-${ts}-${safe}`;
}
