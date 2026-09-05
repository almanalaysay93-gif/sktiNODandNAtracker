# Smart Import Python Converter and Ingestion Pipeline Design Specification

## 1. Understanding Summary

- Python CLI utility converts hospital Excel workbooks (`.xlsx`) to CSV tables and PDF documents to structured Markdown (`.md`).
- System normalizes extracted records against NurseTrack schemas for nurses, trainings, and seminars.
- Drop-folder workflow: operators place source files into `data_import/inputs/` and execute the pipeline.
- Pipeline archives processed input files automatically to `data_import/inputs/archive/YYYY-MM-DD/`.
- PDF parser converts text and tables to Markdown, with OCR detection for scanned documents.
- Ingestion bridge (`server/scripts/importCsv.ts` via `npm run db:import-csv`) resolves foreign key entities and commits records to SQLite and Supabase PostgreSQL.
- Local Windows execution guarantees hospital data privacy with zero external network transmission.

---

## 2. Assumptions and Constraints

- `A1`: The local Python 3.12 environment uses `pandas`, `openpyxl`, `pypdf`, and `rich`.
- `A2`: Hospital spreadsheets may include multi-row banners, merged headers, and blank rows before table headers.
- `A3`: Input source files move to `data_import/inputs/archive/YYYY-MM-DD/` only after successful conversion and validation.
- `A4`: Output files in `data_import/outputs/` overwrite idempotently on each execution.
- `A5`: Unrecognized spreadsheet tabs convert to generic CSV tables to prevent data loss.
- `A6`: The Node.js ingestion script uses existing Drizzle models and database connection utilities in `server/db.ts`.

---

## 3. Decision Log

- `D1`: Scope. Selected full converter, normalizer, and database ingestion bridge. Reason: Solves the end-to-end operational loop from raw files to verified database rows.
- `D2`: Interaction Model. Drop-folder workflow (`inputs/` to `outputs/`) with automatic archiving. Reason: Operators can drop multiple files and avoid complex command-line arguments.
- `D3`: PDF Format Strategy. Structured Markdown tables and text extraction with OCR fallback notification. Reason: Preserves tabular attendee lists while alerting operators when scanned images lack text layers.
- `D4`: Architecture. Hybrid pipeline with Python converter (`data_import/`) and TypeScript ingestion seeder (`server/scripts/importCsv.ts`). Reason: Leverages Python for robust spreadsheet and PDF parsing, while using TypeScript Drizzle ORM for database transactions and entity resolution.
- `D5`: Entity Resolution. Foreign key matching uses exact employee ID matching first, then fuzzy name and area resolution. Reason: Prevents duplicate nurses and broken relation IDs.

---

## 4. Key Risks and Mitigations

- `R1`: Scanned image PDFs without text layers (`G3`).
  - *Mitigation*: The PDF extractor calculates extracted text density per page. If text density is near zero, it flags the document as a scanned image and generates an inspection stub Markdown file.
- `R2`: Entity name mismatches in foreign keys (`G4`).
  - *Mitigation*: Ingestion script utilizes `server/_core/entityResolve.ts` to fuzzy match area and training names against existing database records.
- `R3`: Uncontrolled file reprocessing (`G5`).
  - *Mitigation*: Successful conversion moves input files into timestamped folders inside `data_import/inputs/archive/`.
- `R4`: Ingestion failures during bulk writes (`G1`).
  - *Mitigation*: The ingestion script runs database operations inside transactions with detailed row-by-row error reporting.

---

## 5. Architectural Design

### 5.1 Directory Layout

```text
data_import/
├── inputs/                      # Drop folder for incoming hospital files
│   └── archive/                 # Processed files moved here (YYYY-MM-DD)
├── outputs/                     # Generated .csv and .md files
│   ├── nurses/                  # Normalized nurse roster CSVs
│   ├── trainings/               # Normalized training completion CSVs
│   ├── seminars/                # Normalized seminar attendance CSVs
│   └── markdown/                # Structured Markdown extracts from PDFs
├── extractors/
│   ├── __init__.py
│   ├── excel_extractor.py       # Reads sheets, un-merges cells, locates headers
│   └── pdf_extractor.py         # Extracts text blocks, tables, and detects scanned pages
├── normalizers/
│   ├── __init__.py
│   ├── nurse_normalizer.py      # Normalizes employee columns and splits full names
│   ├── training_normalizer.py   # Normalizes training records, hours, and CPD points
│   ├── seminar_normalizer.py    # Normalizes seminar occurrences and participant roles
│   └── generic_normalizer.py    # Fallback exporter for raw tables
├── convert.py                   # Python CLI entry point for file extraction and archiving
server/scripts/
└── importCsv.ts                 # TypeScript ingestion bridge (npm run db:import-csv)
```

### 5.2 Component Responsibilities

1. **`data_import/convert.py`**:
   - Discovers `.xlsx` and `.pdf` files in `data_import/inputs/`.
   - Passes files to corresponding extractors.
   - Routes extracted tables to normalizers based on header fingerprint scoring.
   - Saves normalized files into subdirectories under `data_import/outputs/`.
   - Moves successfully converted input files to `data_import/inputs/archive/<YYYY-MM-DD>/`.
   - Prints a formatted terminal summary report.

2. **`data_import/extractors/excel_extractor.py`**:
   - Opens workbooks with `openpyxl` in data-only mode.
   - Un-merges cells and fills top-left values across cell spans.
   - Detects header rows within the first ten rows by scoring column density.
   - Returns clean DataFrames per worksheet.

3. **`data_import/extractors/pdf_extractor.py`**:
   - Reads page streams with `pypdf`.
   - Identifies table borders and column alignments to construct Markdown tables.
   - Flags image-only scanned pages when character counts fall below threshold.
   - Outputs formatted Markdown files with table blocks.

4. **`data_import/normalizers/`**:
   - Aligns column aliases to canonical NurseTrack field names.
   - Parses compound names (`"Last, First Middle"`, `"First Middle Last"`).
   - Normalizes date strings to ISO `YYYY-MM-DD`.
   - Cleans numeric fields by stripping text units.

5. **`server/scripts/importCsv.ts` (Ingestion Bridge)**:
   - Command: `npm run db:import-csv`.
   - Reads normalized CSV files from `data_import/outputs/`.
   - Uses `server/_core/entityResolve.ts` to map text names to database IDs.
   - Executes upserts into `nurses`, `areas`, `trainingCatalog`, and `nurseTrainings` tables.
   - Records an entry in `activityLog` for audit tracking.

---

## 6. Testing Strategy

1. **Python Unit and Integration Tests (`data_import/test_converter.py`)**:
   - Tests compound name splitting across edge cases.
   - Tests date parser across Excel serial dates and formatted strings.
   - Tests un-merging of header blocks.
   - Tests PDF table extraction and scanned page detection.
   - Tests file archiving behavior.

2. **TypeScript Ingestion Tests (`server/scripts/importCsv.test.ts`)**:
   - Tests entity resolution against existing SQLite test database.
   - Verifies upsert behavior for duplicate employee IDs.
   - Asserts database row creation and audit log entries.
