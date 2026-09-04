import "dotenv/config";
import express, { type Request, type Response } from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./_core/oauth";
import { registerStorageProxy } from "./_core/storageProxy";
import { appRouter } from "./routers";
import { importStaffEmailsHandler } from "./importStaffEmails";
import { importStaffRosterHandler } from "./importStaffRoster";
import { importStaffAreasHandler } from "./importStaffAreas";
import { importStaffTrainingsHandler } from "./importStaffTrainings";
import { createContext } from "./_core/context";

let appPromise: Promise<express.Express> | null = null;

async function getApp(): Promise<express.Express> {
  const app = express();

  app.use((req, res, next) => {
    if (req.url.includes("%VITE_") || req.url.includes("%25VITE_")) {
      return res.status(204).end();
    }
    try {
      decodeURI(req.url);
      next();
    } catch {
      return res.status(400).end();
    }
  });

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  registerStorageProxy(app);
  registerOAuthRoutes(app);

  app.post("/api/admin/import-staff-emails", importStaffEmailsHandler);
  app.post("/api/admin/import-staff-roster", importStaffRosterHandler);
  app.post("/api/admin/import-staff-areas", importStaffAreasHandler);
  app.post("/api/admin/import-staff-trainings", importStaffTrainingsHandler);

  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  return app;
}

export default async function handler(req: Request, res: Response) {
  try {
    if (!appPromise) {
      appPromise = getApp();
    }
    const app = await appPromise;
    return app(req, res);
  } catch (error) {
    console.error("[Vercel Serverless Error]:", error);
    appPromise = null;
    res.status(500).json({ error: "Internal Server Error" });
  }
}
