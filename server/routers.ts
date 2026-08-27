import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { nursesRouter } from "./routers/nurses";
import { credentialsRouter } from "./routers/credentials";
import { trainingsRouter } from "./routers/trainings";
import { calendarRouter } from "./routers/calendar";
import { notificationsRouter } from "./routers/notifications";
import { dashboardRouter } from "./routers/dashboard";
import { areasRouter } from "./routers/areas";
import { reportsRouter } from "./routers/reports";
import { settingsRouter } from "./routers/settings";
import { seminarsRouter } from "./routers/seminars";
import { staffAccountRouter } from "./routers/staffAccount";
import { smartImportRouter } from "./routers/smartImport";
import { aiInsightsRouter } from "./routers/aiInsights";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),
  nurses: nursesRouter,
  credentials: credentialsRouter,
  trainings: trainingsRouter,
  calendar: calendarRouter,
  notifications: notificationsRouter,
  dashboard: dashboardRouter,
  areas: areasRouter,
  reports: reportsRouter,
  settings: settingsRouter,
  seminars: seminarsRouter,
  staffAccount: staffAccountRouter,
  smartImport: smartImportRouter,
  aiInsights: aiInsightsRouter,
});

export type AppRouter = typeof appRouter;
