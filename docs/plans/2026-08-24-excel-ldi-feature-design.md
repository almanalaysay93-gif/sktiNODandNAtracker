# Excel-Compatible Seminar and LDI Tracking Design

Date: 2026-08-24
Status: Approved
Source: `C:\Users\Admin\Downloads\NN LDI DATABASE SUMMARY.xlsx`

## Goal

Extend SKTI NurseTrack with structured seminar and learning and development intervention tracking based on the workbook workflow. Do not automatically import personal workbook data. Provide an explicit preview and confirmation step before any database write.

## Data model

- Add staff type: Registered Nurse or Nursing Attendant.
- Add personnel statuses Rotated and Resigned while preserving historical records.
- Extend training catalog records with seminar and LDI metadata: provider, venue, start date, end date, optional start and end time, validity, renewal requirement, and target staff group.
- Extend attendance records with participation role: Participant, Speaker, Facilitator, or Preceptor.
- Preserve exact completion date. Do not reduce activity history to year-only markers.
- Add import batch audit records for source filename, preview counts, confirmation state, validation errors, and import totals.

## User experience

### Seminar and LDI catalog

Supervisor can create and edit seminars or LDIs. Each record stores title, category, provider, venue, start and end dates, optional times, certificate requirement, validity period, renewal requirement, and target staff group.

### Seminar detail

Selecting a seminar opens its detail page. Page shows Completed, Scheduled, Cancelled, and Expired attendance lists. Supervisor can search and filter by staff, area, staff type, exact date, and participation role. Page includes "Who has completed this?" and "Who is still missing this?" views plus CSV export.

### Staff profile

Staff profile shows chronological seminar and LDI history with exact start date, end date, role, status, provider, training hours, CPD units, certificate, and expiry.

### Training matrix

Matrix uses staff rows and seminar columns. Each cell shows latest exact completion date, status, or missing marker. Filters cover staff type, area, employment status, category, and full date range. Selecting a seminar header opens seminar detail.

### Reports

- Quarterly attendance ledger derived from exact conducted dates.
- Monthly LDI summary by staff with first-half and second-half totals.
- Seminar attendee list and missing-required-staff list.
- Existing training summary remains available.

## Import flow

`Upload workbook -> parse -> normalize -> validate -> preview -> confirm -> transactional import -> audit log`

Preview recognizes eight workbook sheets. Duplicate matching uses employee ID first, then normalized name plus license number when available. Ambiguous matches are blocked. Validation flags unknown staff, duplicate attendance, invalid dates, conflicting completion dates, missing course titles, and unrecognized markers. Raw workbook content is discarded after parsing unless user explicitly confirms import. Valid records are written in one transaction. Failure rolls back entire batch.

## Compatibility

Reuse existing nurses, credentials, areas, assignments, training catalog, training records, reports, audit log, authentication, and archive behavior. Avoid raw sheet-mirror tables. Existing features and routes remain functional.

## Testing

- Unit tests: full-date parsing, multi-day ranges, participation roles, monthly and quarterly grouping, duplicate detection, and missing-required-staff calculation.
- Integration tests: seminar creation, bulk attendance, seminar attendee query, matrix query, import preview, confirmed import, rollback, and authorization.
- UI checks: catalog, seminar detail, staff history, matrix, reports, and import preview at desktop and mobile widths.
