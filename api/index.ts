import "dotenv/config";
import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "../server/_core/oauth";
import { registerStorageProxy } from "../server/_core/storageProxy";
import { appRouter } from "../server/routers";
import { importStaffEmailsHandler } from "../server/importStaffEmails";
import { importStaffRosterHandler } from "../server/importStaffRoster";
import { importStaffAreasHandler } from "../server/importStaffAreas";
import { importStaffTrainingsHandler } from "../server/importStaffTrainings";
import { createContext } from "../server/_core/context";

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

export default app;
