import { describe, it, expect } from "vitest";
import { appRouter } from "./routers";
import * as db from "./db";

describe("Email Triggers & tRPC Endpoints", () => {
  it("queries emailStatus correctly", async () => {
    const caller = appRouter.createCaller({
      user: { id: 1, openId: "admin-test", name: "Admin", email: "admin@example.com", role: "admin" },
    } as any);

    const status = await caller.settings.emailStatus();
    expect(status).toBeDefined();
    expect(typeof status.configured).toBe("boolean");
    expect(status.mode === "mock" || status.mode === "live").toBe(true);
    expect(typeof status.fromAddress).toBe("string");
  });

  it("sends test email via settings.sendTestEmail", async () => {
    const caller = appRouter.createCaller({
      user: { id: 1, openId: "admin-test", name: "Admin", email: "admin@example.com", role: "admin" },
    } as any);

    const result = await caller.settings.sendTestEmail({ targetEmail: "admin.tester@example.com" });
    expect(result.success).toBe(true);

    const logs = await caller.settings.listEmailLogs({ limit: 10 });
    const match = logs.find((l) => l.recipientEmail === "admin.tester@example.com");
    expect(match).toBeDefined();
    expect(match?.thresholdKey).toBe("test");
  });

  it("triggers manual digest via settings.triggerEmailPassNow", async () => {
    const caller = appRouter.createCaller({
      user: { id: 1, openId: "admin-test", name: "Admin", email: "admin@example.com", role: "admin" },
    } as any);

    const res = await caller.settings.triggerEmailPassNow();
    expect(res).toBeDefined();
    expect(typeof res.expiry.processed).toBe("number");
    expect(typeof res.seminars.processed).toBe("number");
  });
});
