import { describe, it, expect } from "vitest";
import { runLicenseExpiryEmailPass, runUpcomingSeminarEmailPass } from "./email/dispatcher";

describe("Email Background Dispatcher", () => {
  it("runs license expiry email pass safely without throwing", async () => {
    const result = await runLicenseExpiryEmailPass();
    expect(result).toBeDefined();
    expect(typeof result.processed).toBe("number");
    expect(typeof result.sent).toBe("number");
    expect(typeof result.skipped).toBe("number");
  });

  it("runs seminar 48h reminder pass safely without throwing", async () => {
    const result = await runUpcomingSeminarEmailPass();
    expect(result).toBeDefined();
    expect(typeof result.processed).toBe("number");
    expect(typeof result.sent).toBe("number");
  });
});
