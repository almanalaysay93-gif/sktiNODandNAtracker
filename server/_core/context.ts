import { COOKIE_NAME } from "@shared/const";
import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";
import { ENV } from "./env";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

function isLoopbackRequest(req: CreateExpressContextOptions["req"]) {
  const address = req.socket.remoteAddress ?? "";
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

function localAdminUser(): User {
  const now = new Date();
  return {
    id: 1,
    openId: "local-dev-admin",
    name: "Local Supervisor",
    email: null,
    loginMethod: "local-development",
    role: "admin",
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
  };
}

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  // In local dev, if no session cookie exists, provide localAdminUser fallback
  if (!user && !ENV.isProduction) {
    const cookies = opts.req.headers.cookie ?? "";
    if (!cookies.includes(COOKIE_NAME)) {
      user = localAdminUser();
    }
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}

