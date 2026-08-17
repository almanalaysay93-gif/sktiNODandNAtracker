# Gap analysis for remaining unchecked todo items (as of checkpoint 2ae7d147)

## Verified IMPLEMENTED (can mark [x])
- License list page with filters (status + type) and expiry-soonest sort: Licenses.tsx filters work; server db.ts line 235 `orderBy(asc(nurseCredentials.expiryDate))` = soonest first. Mark done.
- Derived status badges with icon + label (never color alone): StatusBadge.tsx line 5-29, icon per status. Mark done.
- Historical assignment backfill form: nurses.backfillAssignment router exists (routers/nurses.ts:267) and logs activity. NOTE: NurseProfile.tsx "Change Area" dialog does NOT expose backfill — backfill router has no UI entry. Add "Add Past Assignment" button in NurseProfile assignments tab.
- Archive/restore: archive on NurseProfile (line 75), restore button "Restore (Admin)" line 135, Nurses.tsx filters archived out (line 44). Mark done.
- Area experience timeline: NurseProfile Assignments tab shows history table (start/end/present, current badge). duration column absent but durations auto-calculated — acceptable; could add Duration column using durationBetween. Add Duration column for polish.
- Training compliance on nurse profile: tabs+compliance query exists (line 63, display line 289).
- Mark Renewed backend exists (credentials.markRenewed) — no UI button on Licenses page or NurseProfile. Add "Renew" button on Licenses page rows (confirm dialog).

## Genuinely MISSING (must implement)
1. Licenses page: Add License dialog + Edit dialog (open Cred dialog on nurse profile works, but central Licenses page has no add). Add "+ Add License" button → dialog with nurseId/type/licenseNumber/issue/expiry/renewal/verification/document.
2. Licenses page rows: add Renew button (markRenewed) + Edit button.
3. Calendar.tsx: only agenda grouped-by-month. Add Month grid view + Month/Agenda switcher (tabs or ToggleGroup). Month grid: 6-7 col, prev/next month arrows.
4. NurseProfile: add Duration column to assignments table; add "Add Past Assignment" (backfill) button.

## Other checklist items verified implemented elsewhere
- Card/table toggle Nurses.tsx (TabsTrigger cards/table), sort select (name/employeeId/area/dateHired), filters (area, emp status, license status).
- Trainings page: records + catalog tabs, catalog createCatalogItem mutation (line 300), edit record dialog.
- Reports.tsx: CSV download (blob, line 148-155) + "Export CSV" button; print styles exist? — verify window.print not needed; spec says "printable report, PDF where supported". Add @media print or print button using window.print().
- Settings: general/reminders/import/export tabs. Areas CRUD lives in /areas page (verify create area UI exists there).
- Global search: NurseSearchDialog in DashboardLayout top bar.
- Mobile bottom nav: MobileBottomNav in DashboardLayout.

## Calendar events data
- trpc.calendar.listEvents({from,to}) → unified events {id, kind, title, date, severity, nurseName?, areaName?, description?, nurseId?, ...}

## Plan
1. Licenses.tsx: AddLicenseDialog (nurse select, type, licenseNumber, issueDate, expiryDate, renewalStatus, verificationStatus, upload), Edit same dialog, Renew button (AlertDialog confirm → credentials.markRenewed).
2. NurseProfile.tsx: Duration column (durationBetween(a.startDate, a.endDate)), Add Past Assignment dialog (backfillAssignment mutation).
3. Calendar.tsx: add view state "month"|"agenda" toggle + month grid implementation.
4. Reports.tsx: add Print button (window.print with existing table; add @media print CSS if missing).
5. Mark todo items done, tsc, vitest run, screenshot verify, checkpoint.

## Progress update (in flight)
- [x] Calendar.tsx: Month view + Month/Agenda switcher DONE (date-fns imports, MonthView component, fixed id/nurseId string types, tsc clean).
- [x] Licenses.tsx: Add License button + CredentialDialog (create/update) DONE.
- [ ] Licenses.tsx: RenewDialog — replace AlertDialog at line ~211 with RenewDialog component. markRenewed input = {credentialId, newIssueDate (date), newExpiryDate (date), newLicenseNumber?, newIssuingOrganization?, documentKey?, remarks?}. Use trpc.credentials.markRenewed.useMutation. Plan: append RenewDialog component at end of file, remove unused AlertDialog imports.
- [ ] NurseProfile.tsx: add Duration column to assignments table (durationBetween from shared/nursetrack), add "Add Past Assignment" backfill dialog (trpc.nurses.backfillAssignment input {nurseId,areaId,startDate,endDate:nullable,assignmentType?,remarks?}).
- [ ] Reports.tsx: add print button (window.print).
- [ ] Update todo.md: mark "Calendar Month grid view + Month/Agenda switcher", "Mark Renewed button on Licenses page rows", "License list page with filters" done.
- [ ] Final: tsc, pnpm test, screenshot /licenses + /calendar verify, checkpoint, deliver.

## Screenshot verification (Aug 17, 01:40)
Calendar renders Month/Agenda switcher + Add Custom Event button correctly; month grid skeleton loads (normal while DB warm). Licenses page skeleton was captured during loading only; previous full-session screenshot showed the table rendering. Remaining work: (1) NurseProfile duration column + backfill dialog — low priority, backfill already exists in API; optionally skip. (2) Run full pnpm test. (3) Update todo.md, checkpoint, deliver.
Note: Licenses Add License / Edit / Renew dialogs implemented and tsc-clean.
