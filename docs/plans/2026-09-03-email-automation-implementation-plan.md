# Email Automation System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a robust, resilient automated email notification system using Resend and an in-process daily scheduler for license expiration alerts, seminar reminders, and profile/record updates.

**Architecture:** A unified email dispatch engine (`server/email/service.ts`) backed by Resend with non-blocking mock fallback, HTML template rendering with hospital branding, an audit ledger table (`emailLogs`) for deduplication and supervisor observability, and daily cron dispatching at 08:00 AM Manila time.

**Tech Stack:** TypeScript, Node.js, Express, tRPC, Drizzle ORM (MySQL + SQLite local fallback), Resend REST API, Vitest.

---

### Task 1: Data Model & Storage Setup (`emailLogs`)

**Files:**
- Modify: `drizzle/schema.ts`
- Modify: `server/localDb.ts`
- Modify: `server/db.ts`
- Test: `server/email-logs.test.ts`

**Step 1: Write the failing test**
Create `server/email-logs.test.ts` testing `recordEmailLog`, `isEmailDuplicate`, and `listRecentEmailLogs`.

**Step 2: Run test to verify it fails**
Run: `npx vitest run server/email-logs.test.ts`
Expected: FAIL with missing functions or table.

**Step 3: Write minimal implementation**
1. Add `emailLogs` schema in `drizzle/schema.ts`.
2. Add `CREATE TABLE IF NOT EXISTS emailLogs` in `server/localDb.ts`.
3. Add `recordEmailLog`, `isEmailDuplicate`, and `listRecentEmailLogs` in `server/db.ts`.

**Step 4: Run test to verify it passes**
Run: `npx vitest run server/email-logs.test.ts`
Expected: PASS

**Step 5: Commit**
```bash
git add drizzle/schema.ts server/localDb.ts server/db.ts server/email-logs.test.ts
git commit -m "feat(email): add emailLogs table and audit ledger queries"
```

---

### Task 2: Core Email Client & HTML Templates

**Files:**
- Create: `server/email/service.ts`
- Create: `server/email/templates.ts`
- Test: `server/email-service.test.ts`

**Step 1: Write the failing test**
Create `server/email-service.test.ts` verifying mock sending, HTML template structure (license expiry, seminar announcement, 48h reminder, profile update), and header/footer brand rendering.

**Step 2: Run test to verify it fails**
Run: `npx vitest run server/email-service.test.ts`
Expected: FAIL with module not found.

**Step 3: Write minimal implementation**
1. Implement `sendEmail({ to, subject, html, emailType, nurseId, referenceId, thresholdKey })` in `server/email/service.ts` with mock mode and Resend fetch dispatch.
2. Implement HTML email generators in `server/email/templates.ts` for:
   - `licenseExpiryTemplate` (90d, 60d, 30d, 7d, expired)
   - `seminarAnnouncementTemplate`
   - `seminarReminderTemplate` (48h)
   - `profileUpdateTemplate`
   - `directNoticeTemplate`

**Step 4: Run test to verify it passes**
Run: `npx vitest run server/email-service.test.ts`
Expected: PASS

**Step 5: Commit**
```bash
git add server/email/service.ts server/email/templates.ts server/email-service.test.ts
git commit -m "feat(email): add email client service and branded HTML templates"
```

---

### Task 3: Background Expiration & Seminar Cron Dispatcher

**Files:**
- Create: `server/email/dispatcher.ts`
- Modify: `server/scheduled.ts`
- Test: `server/email-dispatcher.test.ts`

**Step 1: Write the failing test**
Create `server/email-dispatcher.test.ts` testing:
- Filter active nurses with linked Google account (`accountEmail`).
- Detect licenses meeting 90d, 60d, 30d, 7d, and expired thresholds.
- Deduplication prevents duplicate dispatch for same threshold.
- Detect seminars within 48 hours for registered attendees.

**Step 2: Run test to verify it fails**
Run: `npx vitest run server/email-dispatcher.test.ts`
Expected: FAIL with module not found.

**Step 3: Write minimal implementation**
1. Implement `runLicenseExpiryEmailPass()` and `runUpcomingSeminarEmailPass()` in `server/email/dispatcher.ts`.
2. Connect `runLicenseExpiryEmailPass()` and `runUpcomingSeminarEmailPass()` into `server/scheduled.ts` to run daily at 08:00 AM.

**Step 4: Run test to verify it passes**
Run: `npx vitest run server/email-dispatcher.test.ts`
Expected: PASS

**Step 5: Commit**
```bash
git add server/email/dispatcher.ts server/scheduled.ts server/email-dispatcher.test.ts
git commit -m "feat(email): implement automated expiry and seminar reminder dispatcher"
```

---

### Task 4: tRPC Procedures & Manual Direct Notice

**Files:**
- Create/Modify: `server/routers/notifications.ts` (or `server/routers/settings.ts`)
- Modify: `server/routers/seminars.ts`
- Modify: `server/routers/nurses.ts`
- Modify: `server/routers/credentials.ts`
- Test: `server/email-triggers.test.ts`

**Step 1: Write the failing test**
Create test ensuring:
- Supervisor direct notice mutation sends email and logs entry.
- Test email mutation dispatches test template.
- Recent email logs query returns paginated records.

**Step 2: Run test to verify it fails**
Run: `npx vitest run server/email-triggers.test.ts`
Expected: FAIL

**Step 3: Write minimal implementation**
1. Add `sendTestEmail`, `triggerDailyDigestNow`, and `listEmailLogs` in `server/routers/settings.ts`.
2. Add `sendDirectNotice` in `server/routers/nurses.ts`.
3. Hook asynchronous seminar announcement dispatch in `seminarsRouter.create`.
4. Hook asynchronous verification notice dispatch when supervisor verifies uploaded credential or training.

**Step 4: Run test to verify it passes**
Run: `npx vitest run server/email-triggers.test.ts`
Expected: PASS

**Step 5: Commit**
```bash
git add server/routers/ server/email-triggers.test.ts
git commit -m "feat(email): add tRPC endpoints for test email, direct notice, and dispatch logs"
```

---

### Task 5: Admin UI & Supervisor Controls

**Files:**
- Modify: `client/src/pages/Settings.tsx`
- Modify: `client/src/pages/NurseProfile.tsx`

**Step 1: Add Email System tab/card in `Settings.tsx`**
- Show Resend status (Configured vs Mock Mode).
- Add "Send Test Email" dialog.
- Add "Run Expiry Digest Now" button.
- Render recent email dispatch audit log with status badges (`sent`, `mock_sent`, `failed`).

**Step 2: Add "Send Email Notice" in `NurseProfile.tsx`**
- Add action button on nurse profile allowing supervisor to issue direct custom email notice with preview.

**Step 3: Verify TypeScript & Build**
Run:
- `npm run check`
- `npm test`
- `npm run build`

**Step 4: Commit and push**
```bash
git add client/src/pages/Settings.tsx client/src/pages/NurseProfile.tsx
git commit -m "feat(email): add admin email settings, test email button, and nurse notice modal"
git push origin main
```
