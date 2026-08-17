# SKTI NurseTrack — Working Notes (internal)

## Spec source
User's full spec: /home/ubuntu/upload/pasted_content.txt (1698 lines, JSON). Summary: supervisor-only nurse training/license/area monitoring app.

## Stack facts
- Template: React 19 + Tailwind 4 + Express 4 + tRPC 11, MySQL via drizzle-orm mysql2 (NOT postgres).
- Auth: Manus OAuth only; protectedProcedure for all app routes; single supervisor.
- Storage: server/storage.ts storagePut(key, buffer, mime) → {key, url}; url /manus-storage/<key> (signed, private).
- Scheduled: /api/scheduled/dailyReminders handler in server/scheduled.ts. Create cron via CLI after publish: manus-heartbeat create --name daily-reminders --cron "0 0 8 * * *" --path /api/scheduled/dailyReminders
- Vitest: server/auth.logout.test.ts reference. Run `pnpm test`.

## DB state (custom DDL applied via webdev_execute_sql)
Tables: users, areas (5 seeded: RDU_MAIN, RDU_ANNEX, SKTI_SERVICE_WARD, SKTI_ICU, SKTI_PAY), nurses, areaAssignments, credentialTypes (PRC Registered Nurse License / PRC seeded), nurseCredentials, licenseReminders (unique credentialId+thresholdDays+renewalCycleKey), trainingCatalog (BLS 24mo, ACLS 24mo, IPC 12mo seeded), areaTrainingRequirements, nurseTrainings, customCalendarEvents, notifications (dayKey date col + uniq_notif_day index), activityLog, appSettings.
Generated drizzle migration drizzle/0001_condemned_gauntlet.sql has wrong UNIQUE indexes (N:1 cols) — NOT applied.

## FINAL STATUS (post-testing, ready to deliver)
- ALL 28 tests pass (24 unit in server/shared-logic.test.ts + 4 integration: nurse lifecycle, license lifecycle+renewal, calendar events, reminder idempotence ~2.8s).
- Reminders optimized: runDailyReminders batched — preloads existing reminders + today's notifications, bulk INSERT IGNORE on licenseReminders (uniq_reminder_cycle) and notifications (uniq_notif_day via dayKey).
- drizzle 0.44 quirks: MySqlInsertBase lacks .ignore() → raw INSERT IGNORE via db.execute(sql`...`); eq(col, null) banned → isNull() guarded helpers (notifEqConditions in server/db.ts).
- Reminders API: settings.runRemindersNow → {created, expiredCredentials}; dashboard.actionCenter/upcoming; notifications.list/unreadCount/markRead/markAllRead.
- Screenshots verified: all 8 pages render layout + skeletons; user logged in as "Al john Manalaysay".
- Heartbeat cron NOT yet created (needs publish first).
- Next: checkpoint + deliver; user publishes via UI Publish button.

## Key API shapes (client)
- trpc.nurses: list({archived?,areaId?}), search({query}), get({id}), create, update, archive, restore, uploadPhoto({nurseId,fileBase64,fileName,mimeType}), getAssignments, changeArea({nurseId,newAreaId,effectiveDate,assignmentType,remarks}), backfillAssignment, getEmployeeById. Rows return { ...n, currentArea, licenseStatus, archivedAt }.
- trpc.credentials: listTypes, createType, updateType, list({nurseId?}), listForNurse({nurseId}), create, update, uploadDocument, markRenewed({id}) (preserves history via new credential row).
- trpc.trainings: listCatalog, createCatalogItem({name,category?,renewalRequired?,defaultValidityMonths?}), updateCatalogItem, listRecords, listForNurse({nurseId}), createRecord, updateRecord, uploadCertificate, getAreaRequirements({areaId})→{requiredIds}, setAreaRequirement({areaId,trainingId,required}), getCompliance({nurseId})→{requiredTrainingIds,records,compliancePercent}.
- trpc.calendar: listEvents({from,to,nurseId,areaId})→unified events w/ kind; createCustomEvent/updateCustomEvent/deleteCustomEvent.
- trpc.notifications: list→array, unreadCount→number, markRead({id}), markAllRead (no input).
- trpc.dashboard: summary→{activeNurses,licensesWithin1Year,licensesWithin6Months,licensesExpired,trainingsAttention}; areaSnapshots; actionCenter→{urgent,next30Days,next6Months,next1Year}; activityFeed({limit?}); upcoming→{upcomingCustoms,upcomingLicenses}.
- trpc.areas: list, get, create, update, deactivate, areaDashboard({id})→{area,staffCount,licenseAttention,licensesExpired,trainingAttention,upcomingOutboundTransfers,avgDurationDays}.
- trpc.reports: list→meta; generate({type}) where type in licenseStatus|licenseDue|trainingCompliance|areaExposure|trainingSummary|transferLog.
- trpc.settings: get/getAll/update({key,value}) keys appTitle|reminderThresholdDays|orgName|contactEmail; runRemindersNow; previewCsvImport({csv}); executeCsvImport({csv,skipInvalid?})→{imported,skipped,errors}; exportData({entity}).
- Shared (shared/nursetrack.ts): daysUntilExpiry, todayDate, parseLocalDate, deriveLicenseStatus, LICENSE_STATUS_SEVERITY, LICENSE_STATUS_META, renewalCycleKey, isThresholdDue, urgencyBucket, formatDate, durationBetween, daysBetween, totalExperienceYears, trainingCompliance({requiredTrainingIds,nurseTrainingRecords,today}), nurseFullName, enums (ASSIGNMENT_TYPES, EMPLOYMENT_STATUSES, RENEWAL_STATUSES, VERIFICATION_STATUSES, TRAINING_STATUSES, TRAINING_CATEGORIES), validateMime, sanitizeFilename, storageKey.
- nurseCredentials fields: nurseId, credentialTypeId, licenseNumber, issuingOrganization, issueDate, expiryDate(not null), renewalStatus (Not Started/Renewal In Progress/Submitted/Renewed), verificationStatus, documentKey, renewalCycleKey(not null), remarks.
- nurseTrainings fields: nurseId, trainingId, provider, status (Scheduled/Completed/Expired/Cancelled), scheduledDate, completionDate, expiryDate, trainingHours, cpdUnits, certificateNumber, certificateKey, remarks.
- Photo preview URL: `/manus-storage/<key>` (storage proxy auto-signs).
- tRPC 11 no-input mutations: .mutateAsync(undefined as never).

## UI components & pages (all done)
- DashboardLayout.tsx fully customized (NAV_ITEMS: Dashboard /areas /nurses /trainings /licenses /calendar /reports /settings; branded login; top bar search NotificationsBell; mobile bottom nav).
- components/nursetrack/: StatusBadge.tsx, NurseAvatar.tsx, AreaSelect.tsx, FileUpload.tsx.
- pages: Dashboard.tsx, Nurses.tsx, NurseFormDialog.tsx, NurseProfile.tsx, Areas.tsx, AreaDetail.tsx, Trainings.tsx, Licenses.tsx, Calendar.tsx, Reports.tsx, Settings.tsx. App.tsx routes wired.
- Theme: healthcare palette in index.css (bluish oklch), Inter font in index.html.

## Known gotchas
- tsc "exit code 143" = sandbox killed tsc (memory); rerun `npx tsc --noEmit` fresh.
- Dashboard.tsx useLocation returns [loc, navigate] tuple.
- getNurseLicenseStatus helper in server/db.ts drives licenseStatus on nurse rows.
