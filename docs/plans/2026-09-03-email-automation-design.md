# SKTI NurseTrack Email Automation System Design

**Date**: 2026-09-03
**Status**: Accepted

---

## 1. Context & Objectives

SKTI NurseTrack tracks credentials, licenses, training compliance, and area assignments for 170+ hospital staff nurses. To ensure uninterrupted license renewals and prompt attendance at required clinical seminars, the system requires an automated email dispatch engine.

### Core Objectives
1. **License Expiry Alerts**: Multi-tier alerts at 90, 60, 30, 7 days prior to expiry, plus an overdue notification on expiry date.
2. **Upcoming Seminars**: Instant broadcast when new seminars are published, plus an automated 48-hour reminder for enrolled attendees.
3. **Record & Status Updates**: Instant notification when area assignment changes or uploaded credentials/certificates are verified by a supervisor.
4. **Manual Supervisor Notice**: Supervisor ability to trigger direct email reminders to staff nurses from their profile view.
5. **Strict Recipient Filtering**: Emails sent strictly to staff nurses with a linked Google account (`accountEmail` / `users.email`). Unlinked profiles are safely skipped.

---

## 2. Architecture & Tech Stack

- **Provider**: [Resend](https://resend.com) (`resend` SDK) using `RESEND_API_KEY`.
- **Mock Mode**: If `RESEND_API_KEY` is not set or in test environments, emails are logged to stdout with status `mock_sent` without throwing errors or blocking transactions.
- **Scheduler**: In-process cron via `node-cron` scheduled daily at 08:00 AM Manila Time (UTC+8).
- **Template System**: Inline HTML templates styled with hospital branding (SPMC Nephrology Cluster) and one-click action links to `/me`.

---

## 3. Data Model (`emailLogs`)

A dedicated audit ledger records every outgoing email attempt for deduplication and supervisor observability:

- `id`: Primary key
- `nurseId`: Target nurse ID
- `recipientEmail`: Destination email address
- `emailType`: `"license_expiry"` | `"seminar_announcement"` | `"seminar_reminder"` | `"profile_update"` | `"manual_notice"`
- `referenceId`: ID of credential, seminar, or audit event
- `thresholdKey`: e.g. `"90d"`, `"60d"`, `"30d"`, `"7d"`, `"expired"`, `"48h"`
- `subject`: String
- `status`: `"sent"` | `"failed"` | `"mock_sent"` | `"skipped_unlinked"`
- `errorMessage`: Text if Resend rejected
- `sentAt`: Timestamp

---

## 4. Deduplication Rules

1. **License Expirations**: Checked by `(nurseId, credentialId, thresholdKey, renewalCycleKey)`. Each nurse receives each threshold notice at most once per credential validity cycle.
2. **Seminar Reminders**: Checked by `(seminarId, nurseId, "48h")`. Dispatched once per attendee 48 hours prior to start time.

---

## 5. Supervisor Operations & UI

- **Settings Page**:
  - Live status indicator: `Resend Configured` vs `Mock Mode Active`.
  - Manual action button: "Send Test Email".
  - Manual action button: "Run Expiry Digest Now".
  - Recent email dispatch ledger table.
- **Nurse Profile View**:
  - "Send Email Notice" modal for unit supervisors to issue direct reminders or custom messages.
