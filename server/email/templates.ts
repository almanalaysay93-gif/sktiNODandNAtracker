/**
 * Responsive HTML email templates with SPMC Nephrology Cluster / SKTI NurseTrack branding.
 */

function baseLayout({
  title,
  preheader,
  contentHtml,
  actionButton,
}: {
  title: string;
  preheader?: string;
  contentHtml: string;
  actionButton?: { label: string; url: string };
}): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f4f6f8; color: #1e293b; line-height: 1.6; }
    .wrapper { width: 100%; max-width: 600px; margin: 24px auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
    .header { background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%); padding: 24px; text-align: center; color: #ffffff; }
    .header h1 { margin: 8px 0 0 0; font-size: 20px; font-weight: 700; letter-spacing: -0.02em; }
    .header p { margin: 4px 0 0 0; font-size: 12px; opacity: 0.9; text-transform: uppercase; letter-spacing: 0.05em; }
    .content { padding: 32px 24px; }
    .card-box { background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 16px 0; }
    .btn { display: inline-block; background-color: #0284c7; color: #ffffff !important; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; font-size: 14px; margin-top: 16px; text-align: center; }
    .footer { background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 20px 24px; text-align: center; font-size: 12px; color: #64748b; }
    .badge-urgent { display: inline-block; background-color: #fee2e2; color: #dc2626; font-size: 11px; font-weight: 700; padding: 4px 8px; border-radius: 4px; text-transform: uppercase; }
    .badge-warning { display: inline-block; background-color: #fef3c7; color: #d97706; font-size: 11px; font-weight: 700; padding: 4px 8px; border-radius: 4px; text-transform: uppercase; }
    .badge-info { display: inline-block; background-color: #e0f2fe; color: #0284c7; font-size: 11px; font-weight: 700; padding: 4px 8px; border-radius: 4px; text-transform: uppercase; }
  </style>
</head>
<body>
  ${preheader ? `<div style="display: none; max-height: 0px; overflow: hidden;">${preheader}</div>` : ""}
  <div class="wrapper">
    <div class="header">
      <p>Southern Philippines Medical Center &middot; Nephrology Cluster</p>
      <h1>SKTI NurseTrack</h1>
    </div>
    <div class="content">
      ${contentHtml}
      ${actionButton ? `<div style="text-align: center; margin-top: 24px;"><a href="${actionButton.url}" class="btn">${actionButton.label}</a></div>` : ""}
    </div>
    <div class="footer">
      <p>This is an automated notification from SKTI NurseTrack.<br>For questions or profile updates, log into your personal profile or contact your clinical supervisor.</p>
    </div>
  </div>
</body>
</html>`;
}

export function renderLicenseExpiryEmail({
  nurseName,
  licenseType,
  licenseNumber,
  expiryDateStr,
  daysRemaining,
  thresholdKey,
  actionUrl,
}: {
  nurseName: string;
  licenseType: string;
  licenseNumber: string;
  expiryDateStr: string;
  daysRemaining: number;
  thresholdKey: string;
  actionUrl: string;
}): string {
  const isExpired = daysRemaining <= 0;
  const badgeClass = isExpired || daysRemaining <= 30 ? "badge-urgent" : "badge-warning";
  const badgeLabel = isExpired ? "License Expired" : daysRemaining <= 30 ? "Urgent Renewal Required" : "Upcoming Renewal";

  const content = `
    <div style="margin-bottom: 16px;">
      <span class="${badgeClass}">${badgeLabel}</span>
    </div>
    <h2 style="margin: 0 0 12px 0; font-size: 18px; color: #0f172a;">Hello, ${nurseName}</h2>
    <p style="margin: 0 0 16px 0; color: #334155;">
      ${
        isExpired
          ? `Your <strong>${licenseType}</strong> expired on <strong>${expiryDateStr}</strong> (${Math.abs(daysRemaining)} days ago). Continued clinical duty requires an active license.`
          : `Your <strong>${licenseType}</strong> is due to expire in <strong>${daysRemaining} days</strong> on <strong>${expiryDateStr}</strong>.`
      }
    </p>
    <div class="card-box">
      <table style="width: 100%; font-size: 13px; color: #334155;">
        <tr><td style="padding: 4px 0; font-weight: 600;">Credential:</td><td>${licenseType}</td></tr>
        <tr><td style="padding: 4px 0; font-weight: 600;">License / ID:</td><td>${licenseNumber}</td></tr>
        <tr><td style="padding: 4px 0; font-weight: 600;">Expiry Date:</td><td>${expiryDateStr}</td></tr>
        <tr><td style="padding: 4px 0; font-weight: 600;">Days Remaining:</td><td><strong>${daysRemaining > 0 ? `${daysRemaining} days` : "EXPIRED"}</strong></td></tr>
      </table>
    </div>
    <p style="margin: 16px 0 0 0; font-size: 13px; color: #64748b;">
      Please process your PRC renewal as soon as possible. Once renewed, visit your personal profile to upload your renewed license card or official receipt.
    </p>
  `;

  return baseLayout({
    title: `${isExpired ? "EXPIRED" : "Reminder"}: ${licenseType} Expiry Notice`,
    preheader: `License renewal notification for ${nurseName}`,
    contentHtml: content,
    actionButton: { label: "Upload Renewed License", url: actionUrl },
  });
}

export function renderSeminarAnnouncementEmail({
  nurseName,
  seminarTitle,
  scheduledDateStr,
  venue,
  hours,
  cpdUnits,
  actionUrl,
}: {
  nurseName: string;
  seminarTitle: string;
  scheduledDateStr: string;
  venue?: string | null;
  hours?: number | null;
  cpdUnits?: number | null;
  actionUrl: string;
}): string {
  const content = `
    <div style="margin-bottom: 16px;">
      <span class="badge-info">New Seminar / Training</span>
    </div>
    <h2 style="margin: 0 0 12px 0; font-size: 18px; color: #0f172a;">Hello, ${nurseName}</h2>
    <p style="margin: 0 0 16px 0; color: #334155;">
      A new training seminar has been published for clinical staff in the Nephrology Cluster:
    </p>
    <div class="card-box">
      <h3 style="margin: 0 0 10px 0; font-size: 16px; color: #0284c7;">${seminarTitle}</h3>
      <table style="width: 100%; font-size: 13px; color: #334155;">
        <tr><td style="padding: 4px 0; font-weight: 600; width: 120px;">Date & Time:</td><td>${scheduledDateStr}</td></tr>
        ${venue ? `<tr><td style="padding: 4px 0; font-weight: 600;">Venue:</td><td>${venue}</td></tr>` : ""}
        ${hours ? `<tr><td style="padding: 4px 0; font-weight: 600;">Hours:</td><td>${hours} Hours</td></tr>` : ""}
        ${cpdUnits ? `<tr><td style="padding: 4px 0; font-weight: 600;">CPD Units:</td><td>${cpdUnits} CPD Units</td></tr>` : ""}
      </table>
    </div>
    <p style="margin: 16px 0 0 0; font-size: 13px; color: #64748b;">
      Check your staff profile to view your registration status, required training compliance, and seminar details.
    </p>
  `;

  return baseLayout({
    title: `New Training: ${seminarTitle}`,
    preheader: `Upcoming seminar announcement: ${seminarTitle}`,
    contentHtml: content,
    actionButton: { label: "View on NurseTrack", url: actionUrl },
  });
}

export function renderSeminarReminderEmail({
  nurseName,
  seminarTitle,
  scheduledDateStr,
  venue,
  actionUrl,
}: {
  nurseName: string;
  seminarTitle: string;
  scheduledDateStr: string;
  venue?: string | null;
  actionUrl: string;
}): string {
  const content = `
    <div style="margin-bottom: 16px;">
      <span class="badge-warning">Reminder: Upcoming Seminar in 48 Hours</span>
    </div>
    <h2 style="margin: 0 0 12px 0; font-size: 18px; color: #0f172a;">Hello, ${nurseName}</h2>
    <p style="margin: 0 0 16px 0; color: #334155;">
      This is a friendly reminder that you are scheduled to attend the following seminar in 2 days:
    </p>
    <div class="card-box">
      <h3 style="margin: 0 0 10px 0; font-size: 16px; color: #0f172a;">${seminarTitle}</h3>
      <table style="width: 100%; font-size: 13px; color: #334155;">
        <tr><td style="padding: 4px 0; font-weight: 600; width: 120px;">Schedule:</td><td>${scheduledDateStr}</td></tr>
        ${venue ? `<tr><td style="padding: 4px 0; font-weight: 600;">Venue:</td><td>${venue}</td></tr>` : ""}
      </table>
    </div>
    <p style="margin: 16px 0 0 0; font-size: 13px; color: #64748b;">
      Please ensure your shift endorsement or coverage is coordinated with your unit head prior to attending.
    </p>
  `;

  return baseLayout({
    title: `Reminder: ${seminarTitle} (48 Hours)`,
    preheader: `Reminder for upcoming seminar ${seminarTitle}`,
    contentHtml: content,
    actionButton: { label: "View Seminar Details", url: actionUrl },
  });
}

export function renderProfileUpdateEmail({
  nurseName,
  updateTitle,
  details,
  actionUrl,
}: {
  nurseName: string;
  updateTitle: string;
  details: string;
  actionUrl: string;
}): string {
  const content = `
    <div style="margin-bottom: 16px;">
      <span class="badge-info">Record Update</span>
    </div>
    <h2 style="margin: 0 0 12px 0; font-size: 18px; color: #0f172a;">Hello, ${nurseName}</h2>
    <p style="margin: 0 0 16px 0; color: #334155;">
      Your staff record has been updated by your clinical supervisor:
    </p>
    <div class="card-box">
      <h4 style="margin: 0 0 8px 0; font-size: 14px; color: #0284c7;">${updateTitle}</h4>
      <p style="margin: 0; font-size: 13px; color: #334155;">${details}</p>
    </div>
    <p style="margin: 16px 0 0 0; font-size: 13px; color: #64748b;">
      You can review your updated information anytime on your personal staff profile.
    </p>
  `;

  return baseLayout({
    title: `Record Update: ${updateTitle}`,
    preheader: `Staff record update notice for ${nurseName}`,
    contentHtml: content,
    actionButton: { label: "View My Profile", url: actionUrl },
  });
}

export function renderDirectNoticeEmail({
  nurseName,
  subject,
  message,
  actionUrl,
}: {
  nurseName: string;
  subject: string;
  message: string;
  actionUrl: string;
}): string {
  const content = `
    <div style="margin-bottom: 16px;">
      <span class="badge-info">Supervisor Notice</span>
    </div>
    <h2 style="margin: 0 0 12px 0; font-size: 18px; color: #0f172a;">Hello, ${nurseName}</h2>
    <div class="card-box">
      <h3 style="margin: 0 0 8px 0; font-size: 15px; color: #0f172a;">${subject}</h3>
      <p style="margin: 0; font-size: 13px; color: #334155; white-space: pre-wrap;">${message}</p>
    </div>
  `;

  return baseLayout({
    title: subject,
    preheader: `Notice from your supervisor for ${nurseName}`,
    contentHtml: content,
    actionButton: { label: "Open NurseTrack Profile", url: actionUrl },
  });
}
