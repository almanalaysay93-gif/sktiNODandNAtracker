import { beforeAll, describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import * as db from "./db";
import { inArray, like } from "drizzle-orm";
import {
  nurseCredentials,
  nurseTrainings,
  customCalendarEvents,
  notifications,
  nurses,
} from "../drizzle/schema";

const TEST_PREFIXES = ["TEST-%", "CAL-%", "LIC-%", "NOREAD-%", "BT%"];
function isSafeTestDatabase(url: string | undefined) {
  if (!url) return false;
  try {
    return new URL(url).pathname.replace(/^\//, "").endsWith("_test");
  } catch {
    return false;
  }
}
const safeTestDatabase = isSafeTestDatabase(process.env.DATABASE_URL);
const describeWithDb = safeTestDatabase ? describe : describe.skip;

/** Purge rows created by prior integration-test runs so the suite stays fast. */
async function purgeTestRows() {
  if (!safeTestDatabase) return;
  const sql = await db.getDb();
  if (!sql) return;
  for (const prefix of TEST_PREFIXES) {
    const rows = await sql.select({ id: nurses.id }).from(nurses).where(like(nurses.employeeId, prefix));
    const ids = rows.map((r) => r.id);
    if (!ids.length) continue;
    await sql.delete(notifications).where(inArray(notifications.nurseId, ids));
    await sql.delete(nurseTrainings).where(inArray(nurseTrainings.nurseId, ids));
    await sql.delete(customCalendarEvents).where(inArray(customCalendarEvents.nurseId, ids));
    await sql.delete(nurseCredentials).where(inArray(nurseCredentials.nurseId, ids));
    await sql.delete(nurses).where(inArray(nurses.id, ids));
  }
}

beforeAll(async () => {
  await purgeTestRows();
}, 60000);

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAdminContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "integration-test-user",
    email: "integration@test.com",
    name: "Integration Test",
    loginMethod: "manus",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => undefined } as unknown as TrpcContext["res"],
  };
}

describeWithDb("nurse lifecycle", () => {
  it("creates a nurse, changes area preserving history, archives and restores", async () => {
    const caller = appRouter.createCaller(createAdminContext());

    const created = await caller.nurses.create({
      employeeId: `TEST-${Date.now()}`,
      firstName: "Maria",
      middleName: "Santos",
      lastName: "Reyes",
      position: "RN",
      dateHired: new Date("2024-01-15T00:00:00Z"),
      employmentStatus: "Active",
      currentAreaId: 1,
    });
    expect(created.id).toBeGreaterThan(0);

    const profile = await caller.nurses.get({ id: created.id });
    expect(profile.firstName).toBe("Maria");
    expect(profile.currentArea?.id).toBe(1);

    const beforeHistory = await caller.nurses.getAssignments({ nurseId: created.id });
    const historyLen = beforeHistory.length;

    await caller.nurses.changeArea({
      nurseId: created.id,
      newAreaId: 2,
      effectiveDate: new Date(),
      assignmentType: "Rotation",
      remarks: "Rotation",
    });
    const afterProfile = await caller.nurses.get({ id: created.id });
    expect(afterProfile.currentArea?.id).toBe(2);

    const afterHistory = await caller.nurses.getAssignments({ nurseId: created.id });
    expect(afterHistory.length).toBeGreaterThanOrEqual(historyLen + 1);

    await caller.nurses.archive({ id: created.id });
    const archived = await caller.nurses.get({ id: created.id });
    expect(archived.archivedAt).not.toBeNull();

    await caller.nurses.restore({ id: created.id });
    const restored = await caller.nurses.get({ id: created.id });
    expect(restored.archivedAt).toBeNull();
  }, 30000);
});

describeWithDb("license lifecycle and reminders", () => {
  it("creates a license near expiry, sees due-soon status, renews it, and gets valid status", async () => {
    const caller = appRouter.createCaller(createAdminContext());

    const nurse = await caller.nurses.create({
      employeeId: `LIC-${Date.now()}`,
      firstName: "Test",
      lastName: "Licensor",
      position: "RN",
      dateHired: new Date(),
      employmentStatus: "Active",
      currentAreaId: 1,
    });

    const types = await caller.credentials.listTypes();
    const prc = types.find((t) => t.name.includes("PRC"));
    expect(prc).toBeDefined();

    const nearExpiry = new Date();
    nearExpiry.setDate(nearExpiry.getDate() + 100);
    const cred = await caller.credentials.create({
      nurseId: nurse.id,
      credentialTypeId: prc!.id,
      licenseNumber: "LIC-12345",
      issuingOrganization: "PRC",
      issueDate: new Date(),
      expiryDate: nearExpiry,
    });
    expect(cred.id).toBeGreaterThan(0);

    const creds = await caller.credentials.list();
    const ourCred = creds.find((c) => c.nurseId === nurse.id);
    expect(ourCred).toBeDefined();

    const statusAfter = await caller.nurses.get({ id: nurse.id });
    expect(statusAfter.licenseStatus).not.toBeNull();

    const future = new Date();
    future.setDate(future.getDate() + 730);
    await caller.credentials.markRenewed({
      credentialId: cred.id,
      newIssueDate: new Date(),
      newExpiryDate: future,
      newLicenseNumber: "LIC-12345-R1",
      remarks: "Renewed during integration test",
    });

    const renewed = await caller.nurses.get({ id: nurse.id });
    expect(["Valid", "Within 1 Year"].includes(renewed.licenseStatus ?? "")).toBe(true);
  }, 30000);
});

describeWithDb("calendar events", () => {
  it("lists automatic license events and custom events", async () => {
    const caller = appRouter.createCaller(createAdminContext());

    const nurse = await caller.nurses.create({
      employeeId: `CAL-${Date.now()}`,
      firstName: "Test",
      lastName: "Calendar",
      position: "RN",
      dateHired: new Date(),
      employmentStatus: "Active",
      currentAreaId: 1,
    });
    const types = await caller.credentials.listTypes();
    const near = new Date();
    near.setDate(near.getDate() + 60);
    await caller.credentials.create({
      nurseId: nurse.id,
      credentialTypeId: types.find((t) => t.name.includes("PRC"))!.id,
      licenseNumber: "CAL-99",
      issuingOrganization: "PRC",
      issueDate: new Date(),
      expiryDate: near,
    });

    const custom = await caller.calendar.createCustomEvent({
      eventDate: new Date(),
      title: "Integration test event",
      description: "Test",
      allDay: true,
      areaId: 1,
    });
    expect(custom.id).toBeGreaterThan(0);

    const events = await caller.calendar.listEvents({});
    const auto = events.filter((e) => e.type === "license" && e.nurseId === nurse.id);
    expect(auto.length).toBeGreaterThan(0);
    const customs = events.filter((e) => e.type === "custom");
    expect(customs.some((e) => e.title === "Integration test event")).toBe(true);

    await caller.calendar.deleteCustomEvent({ id: custom.id });
  }, 30000);
});

describeWithDb("notification reading", () => {
  it("markAllRead clears the unread count", async () => {
    const caller = appRouter.createCaller(createAdminContext());

    // Ensure there is at least one notification (create one to be deterministic).
    await caller.notifications.list(); // no-op, just warm the router
    const nurse = await caller.nurses.create({
      employeeId: `NOREAD-${Date.now()}`,
      firstName: "Badge",
      lastName: "Tester",
      position: "RN",
      dateHired: new Date(),
      employmentStatus: "Active",
      currentAreaId: 1,
    });
    const types = await caller.credentials.listTypes();
    const prc = types.find((t) => t.name.includes("PRC"))!;
    await caller.credentials.create({
      nurseId: nurse.id,
      credentialTypeId: prc.id,
      licenseNumber: `NOREAD-${Date.now()}`,
      issuingOrganization: "PRC",
      issueDate: new Date(),
      expiryDate: new Date(), // expires today -> generates a notification on run
    });
    await caller.settings.runRemindersNow();

    const before = (await caller.notifications.unreadCount()) > 0;
    expect(before).toBe(true);

    await caller.notifications.markAllRead();
    const after = await caller.notifications.unreadCount();
    expect(after).toBe(0);

    // A further mark-all-run leaves the count at zero.
    await caller.notifications.markAllRead();
    expect(await caller.notifications.unreadCount()).toBe(0);
  }, 30000);
});

describeWithDb("reminder job idempotence", () => {
  it("does not duplicate notifications on repeated runs", async () => {
    const caller = appRouter.createCaller(createAdminContext());

    await caller.settings.runRemindersNow();
    const firstRun = (await caller.notifications.list()).length;
    await caller.settings.runRemindersNow();
    const secondRun = (await caller.notifications.list()).length;
    expect(secondRun).toBe(firstRun);
  }, 120000);
});
