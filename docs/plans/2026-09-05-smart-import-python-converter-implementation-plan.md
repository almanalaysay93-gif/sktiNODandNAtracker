# Smart Import Converter & Ingestion Pipeline Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use TDD workflow to implement this plan task-by-task.

**Goal:** Build a modular Python data converter utility that transforms hospital Excel workbooks and PDF documents into normalized CSVs and structured Markdown, backed by an automated TypeScript ingestion bridge (`npm run db:import-csv`) to populate NurseTrack database records with entity resolution and archiving.

**Architecture:** A Python conversion pipeline (`data_import/convert.py` + `extractors/` + `normalizers/`) for document processing and file archiving, paired with a TypeScript ingestion script (`server/scripts/importCsv.ts`) utilizing existing Drizzle ORM models and `server/_core/entityResolve.ts` for safe database upserts.

**Tech Stack:** Python 3.12 (pandas, openpyxl, pypdf, rich), TypeScript, Node.js, Drizzle ORM (PostgreSQL/SQLite), Vitest, unittest.

---

### Task 1: Python Document Extractors

**Files:**
- Create: `data_import/extractors/__init__.py`
- Create: `data_import/extractors/excel_extractor.py`
- Create: `data_import/extractors/pdf_extractor.py`
- Create: `data_import/tests/__init__.py`
- Create: `data_import/tests/test_extractors.py`

**Step 1: Write the failing test**
Create `data_import/tests/test_extractors.py` testing:
- Cell un-merging and top-left value propagation.
- Table header discovery past hospital title rows.
- PDF text extraction, Markdown table formatting, and zero-text scanned page detection.

**Step 2: Run test to verify it fails**
Run: `python -m unittest data_import/tests/test_extractors.py`
Expected: FAIL with module import errors.

**Step 3: Write minimal implementation**
1. Implement `excel_extractor.py` using `openpyxl` and `pandas`.
2. Implement `pdf_extractor.py` using `pypdf`.

**Step 4: Run test to verify it passes**
Run: `python -m unittest data_import/tests/test_extractors.py`
Expected: PASS

---

### Task 2: Schema Normalizers

**Files:**
- Create: `data_import/normalizers/__init__.py`
- Create: `data_import/normalizers/nurse_normalizer.py`
- Create: `data_import/normalizers/training_normalizer.py`
- Create: `data_import/normalizers/seminar_normalizer.py`
- Create: `data_import/normalizers/generic_normalizer.py`
- Create: `data_import/tests/test_normalizers.py`

**Step 1: Write the failing test**
Create `data_import/tests/test_normalizers.py` testing:
- Name parsing: `"DELA CRUZ, JUAN M."`, `"JUAN DELA CRUZ JR."`, `"CRUZ, MARIA"`.
- Date conversion to ISO `YYYY-MM-DD` across varied formats.
- Column alias resolution (`Emp ID`, `Ward`, `Position`).
- Role standardization (`Participant`, `Speaker`, etc.).

**Step 2: Run test to verify it fails**
Run: `python -m unittest data_import/tests/test_normalizers.py`
Expected: FAIL.

**Step 3: Write minimal implementation**
Implement all normalizers with header dictionaries and data cleaning functions.

**Step 4: Run test to verify it passes**
Run: `python -m unittest data_import/tests/test_normalizers.py`
Expected: PASS

---

### Task 3: CLI Coordinator and Archiving

**Files:**
- Create: `data_import/convert.py`
- Create: `data_import/tests/test_pipeline_e2e.py`

**Step 1: Write the failing test**
Create `data_import/tests/test_pipeline_e2e.py` verifying:
- Discovery of `.xlsx` and `.pdf` files in `data_import/inputs/`.
- Correct routing to normalizers and outputs generated in `data_import/outputs/`.
- File move from `inputs/` to `inputs/archive/YYYY-MM-DD/`.

**Step 2: Run test to verify it fails**
Run: `python -m unittest data_import/tests/test_pipeline_e2e.py`
Expected: FAIL.

**Step 3: Write minimal implementation**
Implement `data_import/convert.py` with folder creation, dispatching, file archiving, and `rich` table summary.

**Step 4: Run test to verify it passes**
Run: `python -m unittest data_import/tests/test_pipeline_e2e.py`
Expected: PASS

---

### Task 4: TypeScript Database Ingestion Bridge

**Files:**
- Create: `server/scripts/importCsv.ts`
- Modify: `package.json`
- Create: `server/import-csv.test.ts`

**Step 1: Write the failing test**
Create `server/import-csv.test.ts` testing:
- Parsing of generated CSV files.
- Foreign key resolution using `resolveNurse` and `resolveByName`.
- Upsert execution into `nurses`, `areas`, and `nurseTrainings` tables.

**Step 2: Run test to verify it fails**
Run: `npx vitest run server/import-csv.test.ts`
Expected: FAIL.

**Step 3: Write minimal implementation**
1. Implement `server/scripts/importCsv.ts`.
2. Add `"db:import-csv": "tsx server/scripts/importCsv.ts"` in `package.json`.

**Step 4: Run test to verify it passes**
Run: `npx vitest run server/import-csv.test.ts`
Expected: PASS

---

### Task 5: Integration Verification and Documentation

**Files:**
- Create: `data_import/README.md`

**Step 1: Full test run**
Run:
- `python -m unittest discover data_import/tests`
- `npm test`
- `npm run check`

**Step 2: Documentation**
Write `data_import/README.md` explaining directory usage, commands, and schema mapping.
