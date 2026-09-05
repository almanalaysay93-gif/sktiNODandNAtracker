import os
import sys

# Ensure repository root is in sys.path when script is executed directly
REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

import argparse
import datetime
import re
import shutil
from typing import Any, Dict, List

from data_import.extractors.excel_extractor import extract_excel_sheets
from data_import.extractors.pdf_extractor import extract_pdf_document
from data_import.normalizers.nurse_normalizer import is_nurse_roster, normalize_nurse_df
from data_import.normalizers.training_normalizer import is_training_sheet, normalize_training_df
from data_import.normalizers.seminar_normalizer import is_seminar_sheet, normalize_seminar_df
from data_import.normalizers.generic_normalizer import normalize_generic_df

try:
    from rich.console import Console
    from rich.table import Table
    HAS_RICH = True
except ImportError:
    HAS_RICH = False


def sanitize_slug(name: str) -> str:
    """Convert filename or sheet name into a clean filesystem slug."""
    s = re.sub(r"[^a-zA-Z0-9]+", "_", str(name)).strip("_").lower()
    return s if s else "sheet"


def unique_path(path: str, taken: set) -> str:
    """Return a path not already used in this run, suffixing _2, _3, ... on collision.

    Distinct sheet names can share a slug ("Q1 Data" and "Q1-Data"), which would
    otherwise silently overwrite an earlier sheet's CSV.
    """
    if path not in taken:
        taken.add(path)
        return path

    stem, ext = os.path.splitext(path)
    counter = 2
    while f"{stem}_{counter}{ext}" in taken:
        counter += 1
    resolved = f"{stem}_{counter}{ext}"
    taken.add(resolved)
    return resolved


def run_conversion_pipeline(
    inputs_dir: str,
    outputs_dir: str,
    archive_after_run: bool = True
) -> Dict[str, Any]:
    """
    Execute end-to-end extraction and normalization across files in inputs_dir,
    writing structured CSVs and Markdown into outputs_dir.
    """
    os.makedirs(inputs_dir, exist_ok=True)
    out_nurses = os.path.join(outputs_dir, "nurses")
    out_trainings = os.path.join(outputs_dir, "trainings")
    out_seminars = os.path.join(outputs_dir, "seminars")
    out_generic = os.path.join(outputs_dir, "generic")
    out_markdown = os.path.join(outputs_dir, "markdown")

    for d in [out_nurses, out_trainings, out_seminars, out_generic, out_markdown]:
        os.makedirs(d, exist_ok=True)

    today_str = datetime.date.today().isoformat()
    archive_dir = os.path.join(inputs_dir, "archive", today_str)

    files = [
        f for f in os.listdir(inputs_dir)
        if os.path.isfile(os.path.join(inputs_dir, f)) and not f.startswith("~") and not f.startswith(".")
    ]

    summary: Dict[str, Any] = {
        "total_files": len(files),
        "excel_processed": 0,
        "pdf_processed": 0,
        "csvs_generated": 0,
        "markdown_generated": 0,
        "errors": [],
        "file_details": [],
    }

    written_paths: set = set()

    for fname in files:
        fpath = os.path.join(inputs_dir, fname)
        base_name = sanitize_slug(os.path.splitext(fname)[0])
        ext = os.path.splitext(fname)[1].lower()

        try:
            if ext in {".xlsx", ".xls"}:
                sheets = extract_excel_sheets(fpath)
                sheet_count = 0
                for s_name, raw_df in sheets.items():
                    if raw_df.empty:
                        continue
                    sheet_slug = sanitize_slug(s_name)
                    if is_nurse_roster(raw_df):
                        norm_df = normalize_nurse_df(raw_df)
                        dest_dir = out_nurses
                        category = "Nurse Roster"
                    elif is_seminar_sheet(raw_df):
                        norm_df = normalize_seminar_df(raw_df)
                        dest_dir = out_seminars
                        category = "Seminar Occurrence"
                    elif is_training_sheet(raw_df):
                        norm_df = normalize_training_df(raw_df)
                        dest_dir = out_trainings
                        category = "Training / Seminar Log"
                    else:
                        norm_df = normalize_generic_df(raw_df)
                        dest_dir = out_generic
                        category = "Generic Sheet"

                    dest_csv = unique_path(
                        os.path.join(dest_dir, f"{base_name}_{sheet_slug}.csv"), written_paths
                    )
                    norm_df.to_csv(dest_csv, index=False, encoding="utf-8")
                    sheet_count += 1
                    summary["csvs_generated"] += 1
                    summary["file_details"].append({
                        "file": fname,
                        "sheet": s_name,
                        "type": category,
                        "rows": len(norm_df),
                        "output": os.path.basename(dest_csv),
                    })

                summary["excel_processed"] += 1

            elif ext == ".pdf":
                pdf_res = extract_pdf_document(fpath)
                dest_md = unique_path(
                    os.path.join(out_markdown, f"{base_name}.md"), written_paths
                )
                with open(dest_md, "w", encoding="utf-8") as f:
                    f.write(pdf_res["markdown"])
                summary["pdf_processed"] += 1
                summary["markdown_generated"] += 1
                summary["file_details"].append({
                    "file": fname,
                    "sheet": "-",
                    "type": "PDF Document",
                    "rows": f"{pdf_res['page_count']} pages",
                    "output": os.path.basename(dest_md),
                })
            else:
                continue

            # Archive input file on success
            if archive_after_run:
                os.makedirs(archive_dir, exist_ok=True)
                dest_archive = os.path.join(archive_dir, fname)
                # If file already exists in archive, append timestamp
                if os.path.exists(dest_archive):
                    ts = datetime.datetime.now().strftime("%H%M%S")
                    dest_archive = os.path.join(archive_dir, f"{ts}_{fname}")
                shutil.move(fpath, dest_archive)

        except Exception as e:
            summary["errors"].append({"file": fname, "error": str(e)})

    return summary


def main():
    parser = argparse.ArgumentParser(description="NurseTrack Smart Import Data Converter")
    parser.add_argument(
        "--inputs",
        default=os.path.join(os.path.dirname(__file__), "inputs"),
        help="Path to inputs drop directory"
    )
    parser.add_argument(
        "--outputs",
        default=os.path.join(os.path.dirname(__file__), "outputs"),
        help="Path to outputs directory"
    )
    parser.add_argument(
        "--no-archive",
        action="store_true",
        help="Do not move input files to archive folder"
    )

    args = parser.parse_args()
    summary = run_conversion_pipeline(
        inputs_dir=os.path.abspath(args.inputs),
        outputs_dir=os.path.abspath(args.outputs),
        archive_after_run=not args.no_archive,
    )

    if HAS_RICH:
        console = Console()
        table = Table(title="NurseTrack Smart Import Pipeline Summary", show_header=True)
        table.add_column("Input File", style="cyan")
        table.add_column("Sheet / Part", style="magenta")
        table.add_column("Entity Type", style="green")
        table.add_column("Rows / Pages", justify="right")
        table.add_column("Generated File", style="yellow")

        for item in summary["file_details"]:
            table.add_row(item["file"], item["sheet"], item["type"], str(item["rows"]), item["output"])

        console.print(table)
        if summary["errors"]:
            console.print("\n[bold red]Errors encountered:[/bold red]")
            for err in summary["errors"]:
                console.print(f"  - {err['file']}: {err['error']}")
        else:
            console.print(f"\n[bold green]Pipeline completed successfully![/bold green] Processed {summary['total_files']} files.")
    else:
        print(f"Pipeline completed: {summary['total_files']} files processed, {summary['csvs_generated']} CSVs, {summary['markdown_generated']} Markdown docs.")
        for err in summary["errors"]:
            print(f"ERROR in {err['file']}: {err['error']}")


if __name__ == "__main__":
    main()
