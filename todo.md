# SKTI NurseTrack — Project TODO

## Phase 8 — Branding (SPMC logo)
- [x] Upload SPMC Nephrology Nursing logo to webdev static assets
- [x] Show logo in sidebar header + login screen + favicon
- [x] Retheme app with logo palette (navy #122A5E primary, teal #0FA4C7 accent, gold #E8A617, green #3CB43B accents)
- [x] Verify pages render well, tests pass (28/28), checkpoint
- [x] Glass morphism: animated gradient background + frosted-glass classes (.glass-bg root layer, .glass-panel, .glass-card hover lift, .glass-sidebar)
- [x] Glass treatment on DashboardLayout (sidebar glass-sidebar, top bar glass-panel), all dashboard/main card surfaces -> glass-card

## Phase 1 — Foundation
- [x] Database schema: supervisor identity via Manus OAuth (account owner, no dedicated supervisor table); org/app settings stored in settings rows — schema verified live
- [x] Frontend protected routes + auth gating (single supervisor via OAuth; protectedProcedure on all feature routes)
- [x] Apply migration SQL and verify tables
- [x] Seed the 5 fixed areas (RDU MAIN, RDU ANNEX, SKTI SERVICE WARD, SKTI ICU, SKTI PAY) with correct sort order
- [x] Seed credential type "PRC Registered Nurse License"
- [x] Seed training catalog examples (BLS, ACLS, Infection Prevention and Control)
- [x] Private file storage wiring: storagePut used in nurses.uploadPhoto, credentials.uploadDocument, trainings.uploadCertificate (MIME validation + base64 decode)
- [x] Authentication: login via Manus OAuth (single supervisor), protected routes, no nurse accounts
- [x] Shared business logic (status chips data, date helpers, license status calculations, reminder logic, training compliance calc, area experience duration calc)
- [x] All server routers written and wired into appRouter (TypeScript clean)
- [x] Reusable UI components: NurseAvatar, AreaSelect, status badges, file upload helper

## Phase 2 — Nurse Records
- [x] Nurse directory with card grid + list/table toggle, filters (area, employment status, license status), sort options
- [x] Add/Edit Nurse form (all fields: employee ID unique, name, position, date hired, employment status, current area, photo upload) via NurseFormDialog
- [x] Instagram-inspired nurse profile page (header stat chips: years experience, areas served, training count, compliance %)
- [x] Photo upload/replace via storagePut + signed GET URL proxy (/manus-storage/* → presign/get)
- [x] Area experience timeline (assignment history with auto-calculated durations)
- [x] Change Area modal (current area context, new area, effective date, assignment type, remarks, confirmation)
- [x] Historical assignment backfill form on Area Detail page (backfillAssignment mutation)
- [x] Archive/restore nurse behavior (Archive/Restore buttons on profile wired to backend; archived excluded from active counts)

## Phase 3 — Licenses & Reminders
- [x] License add/edit form (credential type, license number, issue/expiry dates, renewal & verification status, file upload) on Licenses page
- [x] License list page with filters (status, type) and expiry-soonest sort, derived status badges
- [x] Mark Renewed workflow preserving history (new record + cycle)
- [x] Mark Renewed button on Licenses page rows (RenewDialog: new issue/expiry dates → new record + cycle preserved)
- [x] Calendar Month grid view + Month/Agenda switcher (date-fns grid, day picker, event dots, nurse links, empty state when filtered)
- [x] Derived status: Expired / Within 6 Months / Within 1 Year / Valid (color + icon, never color alone)
- [x] Daily scheduled job logic (runDailyReminders, idempotent, catchup-capable); heartbeat cron to be created after publish
- [x] Notifications backend (list/unreadCount/markRead/markAllRead)
- [x] Notification bell UI with unread badge/grouping in the main layout
- [x] Dashboard backend (summary/actionCenter/areaSnapshots/activityFeed/upcoming)
- [x] Dashboard UI pages (3-column layout, summary cards, action center, area snapshots, upcoming rail)

## Phase 4 — Training
- [x] Training catalog CRUD (name, category, validity months, renewal required, required areas, active) via CatalogDialog
- [x] Nurse training records (all fields incl. certificate upload, hours, CPD units)
- [x] Trainings page subsections: All / Upcoming / Completed / Expiring ≤90d filters
- [x] Area requirements → compliance percentage on nurse profile (header stat chip, computed from getCompliance)
- [x] Training renewal creates new record, preserving history (edit record with new expiry via training update; renew cycle tracked per-record via expiry dates)

## Phase 5 — Calendar
- [x] Month view (default) + Agenda view switcher
- [x] Automatic events: license 365/180 reminders, expiry, training schedule/expiry, area assignment changes (calendar.listEvents unified)
- [x] Custom events (title, date, times, all-day, related nurse/area, description) via CustomEventDialog
- [x] Filters (license/training/areaChange/custom toggles + text filter); nurse links; event detail panel in Month view

## Phase 6 — Dashboard & Reports
- [x] Summary cards clickable to filtered lists (navigate to /nurses, /licenses, /trainings)
- [x] Supervisor activity feed (dashboard activityFeed section)
- [x] Area snapshot cards (active nurses, license attention, training attention) with photo initials/avatars
- [x] "Upcoming" rail (calendar events, license reminders, training schedules, area changes)
- [x] Reports: licenseStatus, licenseDue, trainingCompliance, areaExposure, trainingSummary, transferLog
- [x] Exports: CSV download + printable report (browser print)

## Phase 7 — Settings & Quality
- [x] Settings: General (org profile), Reminders (thresholds), Data: CSV nurse import with preview/validate/duplicates handling + Export
- [x] Global search in top bar (NurseSearchDialog — name + employee ID → opens profile)
- [x] Navigation: desktop left sidebar, mobile bottom nav + More menu (Sheet)
- [x] Loading skeletons, empty states, error states, validation messages, toasts, confirmation dialogs
- [x] Responsive: desktop grid dashboard, tablet, mobile single column
- [x] Vitest unit tests: license status calc, reminder calc, dedup, area duration, compliance
- [x] Integration tests: create nurse, change area preserves history, license reminders, renew license, archive/restore, calendar events
- [x] Batched reminder engine (INSERT IGNORE on licenseReminders + notifications dayKey unique index) — idempotence test passes in ~3s instead of timing out
- [x] Nurse edit route (/nurses/:id/edit + NurseEditPage)
- [x] Catalog edit + activate/deactivate in UI
- [x] Training records dialog covers all fields (nurse, training type, provider, dates, hours, CPD, cert number, remarks)
- [x] Final checkpoint + deliver
