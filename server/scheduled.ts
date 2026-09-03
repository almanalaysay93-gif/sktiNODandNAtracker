import { runDailyReminders } from "./reminders";
import { todayDate } from "../shared/nursetrack";
import { runLicenseExpiryEmailPass, runUpcomingSeminarEmailPass } from "./email/dispatcher";

const DAILY_RUN_HOUR = 8; // 08:00 server local time, matching the original cron intent

function msUntilNextRun(): number {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), DAILY_RUN_HOUR, 0, 0, 0);
  if (next.getTime() <= now.getTime()) {
    next.setDate(next.getDate() + 1);
  }
  return next.getTime() - now.getTime();
}

async function runOnce() {
  const today = todayDate();
  try {
    const results = await runDailyReminders(today);
    console.log(`[DailyReminders] ran for ${today}:`, results);
  } catch (error) {
    console.error("[DailyReminders] failed:", error);
  }

  try {
    const expiryEmails = await runLicenseExpiryEmailPass(today);
    console.log(`[EmailDispatcher:Expiry] ran for ${today}:`, expiryEmails);
  } catch (error) {
    console.error("[EmailDispatcher:Expiry] failed:", error);
  }

  try {
    const seminarEmails = await runUpcomingSeminarEmailPass();
    console.log(`[EmailDispatcher:Seminars] ran for ${today}:`, seminarEmails);
  } catch (error) {
    console.error("[EmailDispatcher:Seminars] failed:", error);
  }
}

/**
 * Runs the license-reminder pass once a day at DAILY_RUN_HOUR. Idempotent —
 * duplicate runs (restarts, missed days caught up) are safe by DB constraint.
 * Replaces the Manus Heartbeat cron that isn't available off Manus hosting.
 */
export function startDailyReminderScheduler() {
  const scheduleNext = () => {
    setTimeout(async () => {
      await runOnce();
      scheduleNext();
    }, msUntilNextRun());
  };
  scheduleNext();
}
