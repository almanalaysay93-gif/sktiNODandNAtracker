import { describe, expect, it } from "vitest";
import {
  daysUntilExpiry,
  dateKey,
  deriveLicenseStatus,
  durationBetween,
  isThresholdDue,
  nurseFullName,
  renewalCycleKey,
  totalExperienceYears,
  trainingCompliance,
  urgencyBucket,
} from "../shared/nursetrack";

describe("dateKey", () => {
  it("preserves full YYYY-MM-DD string dates", () => {
    expect(dateKey("2026-04-15")).toBe("2026-04-15");
    expect(dateKey("2026-04-15T08:30:00.000Z")).toBe("2026-04-15");
  });

  it("normalizes Date values and rejects malformed strings", () => {
    expect(dateKey(new Date("2026-04-15T00:00:00.000Z"))).toBe("2026-04-15");
    expect(dateKey("2026")).toBe("");
    expect(dateKey("not-a-date")).toBe("");
  });
});

describe("license status calculation", () => {
  const today = "2026-08-17";

  it("returns Expired for past expiry dates", () => {
    expect(deriveLicenseStatus("2025-01-01", today)).toBe("Expired");
    expect(deriveLicenseStatus("2026-08-16", today)).toBe("Expired");
  });

  it("returns Within 6 Months for expiry within 180 days", () => {
    expect(deriveLicenseStatus("2026-10-01", today)).toBe("Within 6 Months");
    expect(deriveLicenseStatus("2027-02-13", today)).toBe("Within 6 Months");
  });

  it("returns Within 1 Year for expiry within 365 days", () => {
    expect(deriveLicenseStatus("2027-05-01", today)).toBe("Within 1 Year");
    expect(deriveLicenseStatus("2027-08-17", today)).toBe("Within 1 Year");
  });

  it("returns Valid for expiry beyond 365 days", () => {
    expect(deriveLicenseStatus("2028-01-01", today)).toBe("Valid");
    expect(deriveLicenseStatus("2030-12-31", today)).toBe("Valid");
  });
});

describe("daysUntilExpiry", () => {
  it("computes whole days between today and the expiry date", () => {
    expect(daysUntilExpiry("2026-08-18", "2026-08-17")).toBe(1);
    expect(daysUntilExpiry("2026-08-17", "2026-08-17")).toBe(0);
    expect(daysUntilExpiry("2026-08-16", "2026-08-17")).toBe(-1);
    expect(daysUntilExpiry("2027-08-17", "2026-08-17")).toBe(365);
  });

  it("handles Date inputs", () => {
    expect(daysUntilExpiry(new Date("2026-08-18T00:00:00Z"), "2026-08-17")).toBe(1);
  });
});

describe("reminder threshold due detection", () => {
  const today = "2026-08-17";

  it("marks a license as threshold-due when within the window", () => {
    expect(isThresholdDue("2027-05-01", 365, today)).toBe(true);
    expect(isThresholdDue("2026-11-01", 180, today)).toBe(true);
  });

  it("does not flag licenses outside the window", () => {
    expect(isThresholdDue("2028-05-01", 365, today)).toBe(false);
    expect(isThresholdDue("2026-11-01", 30, today)).toBe(false);
  });

  it("catches up licenses that crossed the threshold in the past", () => {
    expect(isThresholdDue("2026-10-01", 365, today)).toBe(true);
  });

  it("expired licenses satisfy every threshold (still due)", () => {
    expect(isThresholdDue("2024-01-01", 180, today)).toBe(true);
    expect(isThresholdDue("2024-01-01", 365, today)).toBe(true);
  });
});

describe("urgencyBucket", () => {
  const today = "2026-08-17";

  it("buckets expired and very-soon licenses as urgent", () => {
    expect(urgencyBucket("2026-01-01", today)).toBe("urgent");
    expect(urgencyBucket("2026-09-01", today)).toBe("urgent");
    expect(urgencyBucket(null, today)).toBeNull();
  });

  it("buckets by remaining days", () => {
    expect(urgencyBucket("2026-12-01", today)).toBe("6months");
    expect(urgencyBucket("2027-05-01", today)).toBe("1year");
    expect(urgencyBucket("2029-01-01", today)).toBeNull();
  });
});

describe("renewal cycle key", () => {
  it("derives a stable cycle key from the credential id", () => {
    expect(renewalCycleKey(42)).toBe(renewalCycleKey(42));
    expect(renewalCycleKey(42)).not.toBe(renewalCycleKey(43));
    expect(typeof renewalCycleKey(42)).toBe("string");
  });

  it("changes when the credential is renewed (new id)", () => {
    // Renewal creates a new credential row; the new cycle key must differ.
    expect(renewalCycleKey("7")).not.toBe(renewalCycleKey("8"));
  });
});

describe("area experience and durations", () => {
  it("computes years of experience from assignment rows", () => {
    const years = totalExperienceYears([{ startDate: "2021-08-17" }], "2026-08-17");
    expect(years).toBeCloseTo(5, 0);
  });

  it("handles closed-ended assignments without double counting", () => {
    const years = totalExperienceYears(
      [
        { startDate: "2020-01-01", endDate: "2022-01-01" },
        { startDate: "2024-01-01", endDate: "2026-01-01" },
      ],
      "2026-08-17",
    );
    expect(years).toBeCloseTo(4, 0);
  });

  it("formats human-readable durations", () => {
    expect(durationBetween("2024-01-15", "2026-08-17")).toMatch(/\d+ yr/);
    expect(durationBetween(null, "2026-08-17")).toBe("—");
    expect(durationBetween("2026-08-20", "2026-08-17")).toBe("—");
  });
});

describe("training compliance", () => {
  const today = "2026-08-17";

  it("returns 100 when all required trainings are validly completed", () => {
    const result = trainingCompliance({
      requiredTrainingIds: [1, 2],
      nurseTrainingRecords: [
        { trainingId: 1, status: "Completed", expiryDate: "2028-01-01" },
        { trainingId: 2, status: "Completed", expiryDate: "2027-02-01" },
      ],
      today,
    });
    expect(result).toBe(100);
  });

  it("does not count expired completions as satisfying a requirement", () => {
    const result = trainingCompliance({
      requiredTrainingIds: [1],
      nurseTrainingRecords: [{ trainingId: 1, status: "Completed", expiryDate: "2024-01-01" }],
      today,
    });
    expect(result).toBe(0);
  });

  it("computes partial compliance correctly", () => {
    const result = trainingCompliance({
      requiredTrainingIds: [1, 2, 3],
      nurseTrainingRecords: [
        { trainingId: 2, status: "Completed", expiryDate: "2028-01-01" },
        { trainingId: 3, status: "Cancelled" },
      ],
      today,
    });
    expect(result).toBeCloseTo(33, 0);
  });

  it("returns 100 when no trainings are required", () => {
    expect(trainingCompliance({ requiredTrainingIds: [], nurseTrainingRecords: [] })).toBe(100);
  });

  it("counts a completion with no expiry as always valid", () => {
    const result = trainingCompliance({
      requiredTrainingIds: [1],
      nurseTrainingRecords: [{ trainingId: 1, status: "Completed" }],
      today,
    });
    expect(result).toBe(100);
  });
});

describe("nurseFullName", () => {
  it("joins all name parts with spaces", () => {
    expect(nurseFullName({ firstName: "Maria", middleName: "Santos", lastName: "Reyes", suffix: "RN" })).toBe("Maria Santos Reyes RN");
    expect(nurseFullName({ firstName: "Juan", lastName: "Dela Cruz" })).toBe("Juan Dela Cruz");
  });
});
