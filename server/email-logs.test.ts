import { describe, it, expect, beforeEach } from "vitest";
import * as db from "./db";

describe("emailLogs ledger operations", () => {
  it("records an email attempt and lists recent logs", async () => {
    const id = await db.recordEmailLog({
      nurseId: 1,
      recipientEmail: "test.nurse@example.com",
      emailType: "license_expiry",
      referenceId: 101,
      thresholdKey: "90d",
      subject: "Test PRC License Expiry Notice",
      status: "mock_sent",
      errorMessage: null,
    });
    expect(id).toBeGreaterThan(0);

    const logs = await db.listRecentEmailLogs(10);
    expect(logs.length).toBeGreaterThan(0);
    const found = logs.find((l) => l.id === id);
    expect(found).toBeDefined();
    expect(found?.recipientEmail).toBe("test.nurse@example.com");
    expect(found?.emailType).toBe("license_expiry");
    expect(found?.thresholdKey).toBe("90d");
  });

  it("checks for duplicates correctly", async () => {
    const isDupBefore = await db.isEmailDuplicate({
      nurseId: 2,
      emailType: "license_expiry",
      referenceId: 202,
      thresholdKey: "60d",
    });
    expect(isDupBefore).toBe(false);

    await db.recordEmailLog({
      nurseId: 2,
      recipientEmail: "nurse2@example.com",
      emailType: "license_expiry",
      referenceId: 202,
      thresholdKey: "60d",
      subject: "Test 60d Notice",
      status: "mock_sent",
    });

    const isDupAfter = await db.isEmailDuplicate({
      nurseId: 2,
      emailType: "license_expiry",
      referenceId: 202,
      thresholdKey: "60d",
    });
    expect(isDupAfter).toBe(true);
  });
});
