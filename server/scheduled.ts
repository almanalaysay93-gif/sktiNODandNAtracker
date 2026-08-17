import type { Request, Response } from "express";
import { sdk } from "./_core/sdk";
import { runDailyReminders } from "./reminders";
import { todayDate } from "../shared/nursetrack";

/**
 * Daily license renewal reminder job.
 * Called by the Manus Heartbeat cron at /api/scheduled/dailyReminders.
 * Idempotent: safe to retry; deduplication enforced by DB unique constraint.
 */
export async function dailyRemindersHandler(req: Request, res: Response) {
  try {
    let user;
    try {
      user = await sdk.authenticateRequest(req);
    } catch {
      return res.status(403).json({ error: "not-authenticated" });
    }
    if (!user.isCron || !user.taskUid) {
      return res.status(403).json({ error: "cron-only" });
    }

    const today = todayDate();
    const results = await runDailyReminders(today);
    res.json({ ok: true, today, results });
  } catch (error) {
    console.error("[DailyReminders] failed:", error);
    res.status(500).json({
      error: String(error),
      stack: error instanceof Error ? error.stack : undefined,
      context: { url: req.originalUrl },
      timestamp: new Date().toISOString(),
    });
  }
}
