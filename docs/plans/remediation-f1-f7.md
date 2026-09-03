# Remediation Plan — Findings F1–F7

Status: proposed. Owner: single writer per phase (no parallel edits in one worktree).

## Priority Order

| Phase | Findings | Rationale |
|-------|----------|-----------|
| 0 | F5, F1 (kill switch) | Stop production data corruption and insecure auth immediately |
| 1 | F1, F2 | Correct identity resolution in seeder |
| 2 | F3, F4 | User-visible broken flows |
| 3 | F6 | Restore test signal |
| 4 | F7 | Reconnect or remove dead surface area |

---

## Phase 0 — Immediate Safety (ship first, small diff)

### F5 — Fallback JWT secret

`server/_core/sdk.ts:158`

```ts
const secret = ENV.cookieSecret || "skti-default-jwt-secret-key-32-chars-min!";
```

Repository-known constant signs production sessions when `JWT_SECRET` is unset. Anyone with repo access can forge a session cookie.

Fix:
1. In `getSessionSecret()`, throw when `ENV.isProduction && !ENV.cookieSecret`.
2. Keep the dev fallback but log a loud warning once at startup, and require min length 32.
3. Add a startup precondition check in `server/_core/index.ts` that validates required env (`JWT_SECRET`, `DATABASE_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`) and exits non-zero in production with a listed-missing-keys message.
4. Rotate `JWT_SECRET` after deploy — existing sessions signed with the default must be invalidated.

Verify: boot with `NODE_ENV=production` and no `JWT_SECRET` → process exits with clear error. Boot with secret set → normal startup.

### F1 (part A) — Disable auto-seed on startup

`server/_core/index.ts:92`

`seedExcelDatabase()` runs on every production boot, mutating live records. Gate it behind an explicit opt-in env flag (`SEED_ON_BOOT=1`), default off. Auto-dedup (`deduplicateDatabase()`) also runs unconditionally — gate the same way.

Verify: production boot writes no seed log lines and leaves row counts unchanged.

---

## Phase 1 — Seeder Identity Correctness

### F1 — Duplicate employee IDs merge distinct people

`server/seedExcel.ts:199-230`

Root cause: 173 staff rows, 171 unique employee IDs. `769648` and `558388` each map to two different people. Lookup at line 202 matches by `employeeId` first, then falls back to a normalized name key; on match it overwrites `firstName`/`lastName`/`position`/`currentAreaId`. Two people collapse into one record and the second overwrite wins.

Fix:
1. **Data audit first.** Add a preflight validation pass over `server/data/seedData.json` that groups by `employeeId` and fails with the offending rows listed when one ID maps to more than one distinct normalized name. Run it as a standalone script and as a test.
2. **Correct the source data.** The two colliding IDs are data-entry errors — obtain the real employee IDs for the four affected people from the source workbook. Do not synthesize IDs silently; if a true ID is unavailable, mark the row with an explicit `employeeIdUnverified: true` and a deterministic surrogate key (e.g. `UNVERIFIED-<lastname>-<firstname>`), never a real-looking ID.
3. **Make the seeder identity key composite.** Match on `(employeeId, normalizedName)` rather than `employeeId` alone. On an `employeeId` hit whose name does not match, do not update — record a conflict and skip.
4. **Return a conflict report.** `seedExcelDatabase()` should return `{ inserted, updated, conflicts: [...] }`; log conflicts at warn level with row identifiers.
5. Never fall through to the bare-lastname name key for staff matching (see F2).

Verify: seeding a fresh database from corrected data yields 173 nurse rows; re-running is idempotent (0 inserted, 0 conflicts). Seeding uncorrected data fails preflight.

### F2 — Attendance attaches training to the wrong staff member

`server/seedExcel.ts:317-323` (also `:359-368` for matrix completions)

Root cause: resolution order is `employeeId` → full normalized name → **bare last name**. Line 235 registers `lastName.toUpperCase()` alone as a lookup key, so the last writer for a shared surname wins. 359 of 856 attendance rows fall back to surname, 16 of those surnames are shared, 13 rows resolve to nothing and are dropped with a bare `continue`.

Fix:
1. Delete the bare-surname key registration (`server/seedExcel.ts:235`) and the surname fallback branches at `:320-321` and `:365-366`.
2. Keep resolution strictly: `employeeId` → exact normalized `LAST, FIRST`. Nothing else.
3. Track ambiguity explicitly: build `nurseIdsByLastName: Map<string, number[]>` only for reporting. If an unresolved row's surname maps to exactly one nurse, resolve it and count it as `resolvedBySurname`; if it maps to more than one, record it as `ambiguous` and skip.
4. Replace every silent `continue` with a counter and a collected row descriptor. Return `{ attached, resolvedBySurname, ambiguous, unresolved }` and log the unresolved list.
5. Fix the 13 unresolved rows in source data by adding employee IDs.

Verify: after fix, `ambiguous === 0` and `unresolved === 0` on the corrected dataset; total attendances match the workbook count. Add a regression test asserting that no two nurses share a resolution key.

---

## Phase 2 — Broken User Flows

### F3 — Credential edit dialogs open empty

Two separate dialogs, same class of bug.

**`client/src/pages/Licenses.tsx:230,258`** — `current` is computed and a `reset()` helper exists that copies `current` into form state, but `reset()` is never called. No `useEffect`, no invocation anywhere in the file.

Fix: add
```ts
useEffect(() => { if (open) reset(); }, [open, current?.id, editId]);
```
Gate on `current` being loaded so the async query result populates once it arrives.

**`client/src/pages/NurseProfile.tsx:518`** — `current` is computed but there is no reset helper at all; all nine `useState` fields start blank. Save additionally builds `createData` requiring `credentialTypeId: Number(typeId)` and `expiryDate` (marked `*` in the UI at `:589,:610`), so editing an existing credential fails validation until the user retypes both.

Fix:
1. Add a `reset()` that maps `current` → the nine state fields (mirroring the Licenses.tsx shape), and the same `useEffect` trigger.
2. For the update path, do not require `typeId`; `updateData` at `:570` already omits `credentialTypeId`. Only the create path should demand type and expiry.
3. Disable Save while `credentialId && !current` (data still loading) so a submit cannot fire against empty state.

Verify: open Edit on an existing credential from both pages → every field pre-filled; change one field, Save → only that field changes, no validation error.

### F4 — Export buttons produce empty `{}`

`client/src/pages/Settings.tsx:247-253` offers five entities; `server/routers/settings.ts:209-227` populates `out.nurses` only for `nurses`/`all`, and credentials/trainings/assignments only for `all`. Selecting `credentials`, `trainings`, or `assignments` returns `{}`.

Fix (server, `settings.ts:211-226`) — replace the branch chain with per-entity population:
```
nurses      → out.nurses
credentials → out.nurseCredentials
trainings   → out.nurseTrainings
assignments → out.areaAssignments
all         → all four
```
Also: the client should refuse to download an empty payload and toast instead, as a guard against future drift.

Verify: each of the five buttons downloads a file with a non-empty top-level key matching the entity; row counts match the corresponding table.

---

## Phase 3 — Test Suite

### F6 — Stale expectations, skipped integration tests

Current: 3 failed, 29 passed, 5 skipped.

`server/seedData.test.ts:27-32` asserts 159 staff / 293 catalog / 312 events / 823 attendance and an attendee schema keyed on `employeeId` prefixes (`RN-`, `NA-`). Actual seed data is 173 staff / 856 attendance rows with a different attendee shape.

Fix:
1. Re-derive expectations from the corrected Phase 1 dataset — but assert **invariants**, not just magic numbers: unique employee IDs equal staff count; every attendee resolves to exactly one staff record; no attendee falls back to surname.
2. Keep one snapshot-style count assertion for drift detection, updated to real counts, with a comment stating it must be updated deliberately when the workbook changes.
3. Update the `SeedData` type at `:5-15` to the current attendee schema.

`server/nursetrack.integration.test.ts:23` skips everything without a safe test database.

Fix: document the required `TEST_DATABASE_URL` in `.env.example` and add a `test:integration` script that fails loudly (rather than skipping) when the variable is set but unreachable. Skipping stays the default only when the variable is absent.

Verify: `npm test` → 0 failed. With `TEST_DATABASE_URL` set → integration tests run, not skip.

---

## Phase 4 — Disconnected Surface Area

### F7 — Server capability with no client caller

Inventory to resolve, each with an explicit decision of **wire up** or **delete**:

| Item | Location | Proposed action |
|------|----------|-----------------|
| Area deactivation / area dashboard | `server/routers/areas.ts` | Wire up — add to Areas page (deactivate action + per-area dashboard view) |
| Custom event editing | `server/routers/seminars.ts` / `calendar.ts` | Wire up — edit action on the calendar event detail |
| Credential type management | `server/routers/credentials.ts` (listTypes has callers; CRUD does not) | Wire up — Settings → Credential Types admin tab |
| Area training requirements editing | `server/routers/areas.ts` / `trainings.ts` | Wire up — Area detail tab |
| `/api/admin/import-staff-emails`, `-roster`, `-areas`, `-trainings` | `server/_core/index.ts:60-63` | Decide: these bypass tRPC auth middleware — either put them behind `adminProcedure`-equivalent auth and expose in Settings → Import, or delete. Do not leave unauthenticated import endpoints live. |
| `ComponentShowcase.tsx` | `client/src/pages/` | Delete, or gate behind a dev-only route not present in production builds |

Sequencing: audit the four import endpoints **first** — an unauthenticated admin import route is a security issue, not a tidiness issue. Confirm current auth posture on each before deciding.

Verify: no exported router procedure lacks either a client caller or an explicit `// intentionally server-only` annotation. Add a lint-style script that greps procedures against client usage to keep this from regressing.

---

## Cross-Cutting Rules

- One writer per phase; isolated worktree per writing agent.
- Every phase ends with `npm run build && npm test` green before the next starts.
- Phases 0 and 1 touch production data paths — take a database snapshot before deploying either.
- Bind each fix commit to the finding ID (`fix(seed): F2 remove surname fallback`).
