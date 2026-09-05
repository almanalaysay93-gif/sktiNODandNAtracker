# NurseTrack Smart Import Data Conversion and Ingestion

This utility converts hospital Excel files (`.xlsx`) to CSV tables and PDF documents to structured Markdown (`.md`).
It includes an automated database ingestion command to load normalized records into NurseTrack.

---

## Directory Structure

```text
data_import/
├── inputs/                      # Drop your raw hospital .xlsx and .pdf files here
│   └── archive/                 # Processed files move here automatically (YYYY-MM-DD)
├── outputs/                     # Generated normalized tables and documents
│   ├── nurses/                  # Normalized staff roster CSVs
│   ├── trainings/               # Normalized training completion CSVs
│   ├── seminars/                # Normalized seminar attendance CSVs
│   ├── generic/                 # Fallback CSVs for unrecognized sheets
│   └── markdown/                # Structured Markdown extracts from PDFs
├── extractors/                  # Excel and PDF decoding modules
├── normalizers/                 # Schema mapping and name/date normalization
├── convert.py                   # Main Python conversion CLI
└── tests/                       # Automated test suites
```

---

## Quick Start Workflow

### 1. Drop Source Files
Place hospital spreadsheets (`.xlsx`) or training documents (`.pdf`) into `data_import/inputs/`.

### 2. Run the Conversion Utility
Run the converter script from the repository root:

```bash
python data_import/convert.py
```

- Excel worksheets are classified automatically as Nurse Rosters, Training Logs, or Seminar Lists.
- Cells with merged headers un-merge automatically.
- Complex Filipino names (`"DELA CRUZ, JUAN M."`, `"JUAN SANTOS DELA CRUZ JR."`) split into standard name fields.
- Dates convert to standard ISO format (`YYYY-MM-DD`).
- PDF documents convert to GitHub-flavored Markdown with table detection.
- Scanned PDF pages without embedded text trigger warnings.
- Converted input files move automatically to `data_import/inputs/archive/YYYY-MM-DD/`.

To run without archiving input files:
```bash
python data_import/convert.py --no-archive
```

### 3. Ingest Data Into the Database
Run the TypeScript ingestion bridge:

```bash
npm run db:import-csv
```

- Reads normalized CSV files from `data_import/outputs/`.
- Resolves employee IDs and names against existing database records.
- Creates new hospital areas and training catalog items automatically.
- Upserts records into `nurses`, `areas`, `areaAssignments`, and `nurseTrainings`.
- Records an audit log entry in `activityLog`.

---

## Testing

Run Python extractor and normalizer tests:
```bash
python -m unittest discover data_import/tests
```

Run TypeScript ingestion tests:
```bash
npx vitest run server/import-csv.test.ts
```
