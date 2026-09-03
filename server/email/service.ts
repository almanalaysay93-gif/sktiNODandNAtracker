import { recordEmailLog } from "../db";

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  emailType: "license_expiry" | "seminar_announcement" | "seminar_reminder" | "profile_update" | "manual_notice";
  nurseId: number;
  referenceId?: number | null;
  thresholdKey?: string | null;
}

export interface SendEmailResult {
  success: boolean;
  status: "sent" | "mock_sent" | "failed";
  error?: string;
}

const DEFAULT_FROM = process.env.EMAIL_FROM || "SKTI NurseTrack <notifications@sktinursetrack.com>";

/**
 * Dispatches an email via Resend if RESEND_API_KEY is configured,
 * or logs to console in mock mode for development / testing.
 * Automatically records an entry in emailLogs for audit and deduplication.
 */
export async function sendEmail(opts: SendEmailOptions): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    // Mock mode: log dispatch and record in ledger
    console.log(`[Email:Mock] To: ${opts.to} | Subject: "${opts.subject}" | Type: ${opts.emailType}`);
    await recordEmailLog({
      nurseId: opts.nurseId,
      recipientEmail: opts.to,
      emailType: opts.emailType,
      referenceId: opts.referenceId ?? null,
      thresholdKey: opts.thresholdKey ?? null,
      subject: opts.subject,
      status: "mock_sent",
      errorMessage: null,
    });
    return { success: true, status: "mock_sent" };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: DEFAULT_FROM,
        to: [opts.to],
        subject: opts.subject,
        html: opts.html,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[Email:ResendError] ${res.status}: ${errText}`);
      await recordEmailLog({
        nurseId: opts.nurseId,
        recipientEmail: opts.to,
        emailType: opts.emailType,
        referenceId: opts.referenceId ?? null,
        thresholdKey: opts.thresholdKey ?? null,
        subject: opts.subject,
        status: "failed",
        errorMessage: errText.slice(0, 1000),
      });
      return { success: false, status: "failed", error: errText };
    }

    await recordEmailLog({
      nurseId: opts.nurseId,
      recipientEmail: opts.to,
      emailType: opts.emailType,
      referenceId: opts.referenceId ?? null,
      thresholdKey: opts.thresholdKey ?? null,
      subject: opts.subject,
      status: "sent",
      errorMessage: null,
    });

    return { success: true, status: "sent" };
  } catch (err: any) {
    const errorMsg = err?.message || String(err);
    console.error(`[Email:Exception] ${errorMsg}`);
    await recordEmailLog({
      nurseId: opts.nurseId,
      recipientEmail: opts.to,
      emailType: opts.emailType,
      referenceId: opts.referenceId ?? null,
      thresholdKey: opts.thresholdKey ?? null,
      subject: opts.subject,
      status: "failed",
      errorMessage: errorMsg.slice(0, 1000),
    });
    return { success: false, status: "failed", error: errorMsg };
  }
}
