# SKTI NurseTrack — Project TODO

## Phase 1 — Foundation
- [ ] Database schema: supervisors profile (backend done; sync TS schema to live DB + verify parity)
- [ ] Frontend protected routes + auth gating (single supervisor via OAuth; protectedProcedure on all app routes)
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
- [ ] Nurse directory with card grid + list/table toggle, filters (area, employment status, license status, training status), sort options
- [ ] Add/Edit Nurse form (all fields: employee ID unique, name, position, date hired, employment status, current area, photo upload)
- [ ] Instagram-inspired nurse profile page (header stats: years experience, training count, compliance %)
- [ ] Photo upload/replace with signed URLs
- [ ] Area experience timeline with auto-calculated durations
- [ ] Change Area modal (current area, new area, effective date, assignment type, remarks, confirmation)
- [ ] Historical assignment backfill form
- [ ] Archive/restore nurse behavior (hide from active counts, keep history)

## Phase 3 — Licenses & Reminders
- [ ] License add/edit form (credential type, license number, issue/expiry dates, renewal & verification status, file upload)
- [ ] License list page with filters and expiry-soonest sort, derived status badges
- [ ] Mark Renewed workflow preserving history (new record + cycle)
- [ ] Derived status: Expired / Within 6 Months / Within 1 Year / Valid (color + icon, never color alone)
- [x] Daily scheduled job logic (runDailyReminders, idempotent, catchup-capable); heartbeat cron to be created after publish
- [x] Notifications backend (list/unreadCount/markRead/markAllRead)
- [x] Notification bell UI with unread badge/grouping in the main layout
- [x] Dashboard backend (summary/actionCenter/areaSnapshots/activityFeed/upcoming)
- [x] Dashboard UI pages (3-column layout, summary cards, action center, area snapshots, upcoming rail)

## Phase 4 — Training
- [ ] Training catalog CRUD (name, category, validity months, renewal required, required areas, active)
- [ ] Nurse training records (all fields incl. certificate upload, hours, CPD units)
- [ ] Trainings page subsections: Upcoming, Completed, Expiring
- [ ] Area requirements → compliance percentage on nurse profile
- [ ] Training renewal creates new record, preserving history

## Phase 5 — Calendar
- [ ] Month view, Week view, Agenda view (default Month)
- [ ] Automatic events: license 365/180 reminders, expiry, training schedule/expiry, area assignment changes
- [ ] Custom events (title, date, times, all-day, related nurse/area, description)
- [ ] Filters (All, Licenses, Trainings, Area Changes, Custom); event detail drawer with related links

## Phase 6 — Dashboard & Reports
- [ ] Summary cards: Active Nurses, Licenses 1 Year, 6 Months, Expired, Trainings Due — each clickable to filtered list
- [ ] Supervisor activity feed (feed item types with photos, status badges, action buttons)
- [ ] Area snapshot cards (active nurses, license attention, training attention) with nurse photo stacks
- [ ] Right "Upcoming" sidebar (calendar events, license reminders, training schedules, area changes)
- [ ] Reports: Nurses by Area, License Expiration, Training Report, Training Compliance by Area, Nurse Area Experience, Upcoming Calendar Items
- [ ] Exports: CSV download, printable report, PDF where supported

## Phase 7 — Settings & Quality
- [ ] Settings: General (app name, hospital name, supervisor name, logo), Areas CRUD, Training Catalog, Credentials, Reminders display, Data (export DB, CSV nurse import with preview/validate/duplicates handling, archive view)
- [ ] Global search in top bar (name + employee ID → opens profile)
- [ ] Navigation: desktop left sidebar, mobile bottom nav + More menu
- [ ] Loading skeletons, empty states, error states, validation messages, toasts, confirmation dialogs
- [ ] Responsive: desktop 3-column dashboard, tablet, mobile single column
- [x] Vitest unit tests: license status calc, reminder calc, dedup, area duration, compliance
- [x] Integration tests: create nurse, change area preserves history, license reminders, renew license, archive/restore, calendar events
- [x] Batched reminder engine (INSERT IGNORE on licenseReminders + notifications dayKey unique index) — idempotence test passes in ~3s instead of timing out
- [ ] Final checkpoint + deliver
