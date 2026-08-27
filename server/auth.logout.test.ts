import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { COOKIE_NAME } from "../shared/const";
import type { TrpcContext } from "./_core/context";

type CookieCall = {
  name: string;
  options: Record<string, unknown>;
};

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): { ctx: TrpcContext; clearedCookies: CookieCall[] } {
  const clearedCookies: CookieCall[] = [];

  const user: AuthenticatedUser = {
    id: 1,
    openId: "sample-user",
    email: "sample@example.com",
    name: "Sample User",
    loginMethod: "google",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: (name: string, options: Record<string, unknown>) => {
        clearedCookies.push({ name, options });
      },
    } as TrpcContext["res"],
  };

  return { ctx, clearedCookies };
}

describe("auth.logout", () => {
  it("clears the session cookie and reports success", async () => {
    const { ctx, clearedCookies } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auth.logout();

    expect(result).toEqual({ success: true });
    expect(clearedCookies).toHaveLength(1);
    expect(clearedCookies[0]?.name).toBe(COOKIE_NAME);
    expect(clearedCookies[0]?.options).toMatchObject({
      maxAge: -1,
      secure: true,
      sameSite: "none",
      httpOnly: true,
      path: "/",
    });
  });
});

describe("sdk session token handling", () => {
  it("creates and verifies session even with empty name or missing optional fields", async () => {
    const { sdk } = await import("./_core/sdk");
    const token = await sdk.createSessionToken("google-sub-12345", { name: "" });
    expect(token).toBeTruthy();

    const verified = await sdk.verifySession(token);
    expect(verified).not.toBeNull();
    expect(verified?.openId).toBe("google-sub-12345");
    expect(verified?.name).toBe("User");
  });

  it("decodes valid and invalid oauth state safely without crashing", async () => {
    const { decodeOAuthState, encodeOAuthState } = await import("../shared/const");
    const encoded = encodeOAuthState({ redirectUri: "https://example.com/callback", nonce: "test-nonce-123" });
    const decoded = decodeOAuthState(encoded);
    expect(decoded.redirectUri).toBe("https://example.com/callback");
    expect(decoded.nonce).toBe("test-nonce-123");

    const garbage = decodeOAuthState("not-valid-base64-%%%");
    expect(garbage.redirectUri).toBe("");
    expect(garbage.nonce).toBeUndefined();
  });
});
