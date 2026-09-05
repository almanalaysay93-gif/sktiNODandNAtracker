import os
import re
from typing import Any, Dict, List
import pypdf


def format_table_block(table_rows: List[List[str]]) -> str:
    """Convert a 2D list of cell strings into GitHub-flavored Markdown table."""
    if not table_rows:
        return ""

    num_cols = max(len(r) for r in table_rows)
    if num_cols == 0:
        return ""

    padded_rows = []
    for r in table_rows:
        row_padded = r + [""] * (num_cols - len(r))
        padded_rows.append([cell.replace("|", "\\|").strip() for cell in row_padded])

    header_line = "| " + " | ".join(padded_rows[0]) + " |"
    separator_line = "| " + " | ".join(["---"] * num_cols) + " |"
    data_lines = ["| " + " | ".join(r) + " |" for r in padded_rows[1:]]

    return "\n".join([header_line, separator_line] + data_lines) + "\n"


def parse_page_text_to_markdown(text: str, page_num: int) -> str:
    """Parse extracted page text into structured headings, key-values, and tables."""
    lines = [line.strip() for line in text.split("\n") if line.strip()]
    if not lines:
        return ""

    output_blocks: List[str] = []
    current_table: List[List[str]] = []

    def flush_table():
        nonlocal current_table
        if current_table:
            output_blocks.append(format_table_block(current_table))
            current_table = []

    for idx, line in enumerate(lines):
        # 1. Pipe-delimited table row check
        if "|" in line:
            cells = [c.strip() for c in line.split("|") if c.strip() or line.startswith("|")]
            # Filter out outer empty cells from leading/trailing pipes
            filtered_cells = [c for c in line.split("|")]
            if filtered_cells and not filtered_cells[0].strip():
                filtered_cells.pop(0)
            if filtered_cells and not filtered_cells[-1].strip():
                filtered_cells.pop()
            cells = [c.strip() for c in filtered_cells]
            if len(cells) >= 2:
                current_table.append(cells)
                continue

        # 2. Multi-space delimited table row check (3 or more columns separated by 2+ spaces)
        space_split = [c.strip() for c in re.split(r"\s{2,}|\t+", line) if c.strip()]
        if len(space_split) >= 3 and not line.endswith(":") and len(line) > 15:
            current_table.append(space_split)
            continue

        # Not a table row: flush any accumulated table
        flush_table()

        # 3. Heading check: Short line in ALL CAPS or title banner
        is_all_caps = line.isupper() and len(line) > 3 and not re.search(r"[:\d/]", line)
        if (idx == 0 or is_all_caps) and len(line.split()) <= 10:
            heading_level = "#" if idx == 0 else "##"
            output_blocks.append(f"{heading_level} {line}\n")
            continue

        # 4. Key-Value check (e.g. "Date: 2026-08-15")
        kv_match = re.match(r"^([A-Za-z0-9 ]{2,30}):\s*(.+)$", line)
        if kv_match:
            key, val = kv_match.groups()
            output_blocks.append(f"- **{key.strip()}**: {val.strip()}")
            continue

        # 5. Standard paragraph
        output_blocks.append(f"{line}\n")

    flush_table()
    return "\n".join(output_blocks).strip()


def extract_pdf_document(filepath: str) -> Dict[str, Any]:
    """
    Extract text and tabular structures from a PDF, formatting as Markdown
    and detecting image-only / scanned pages.
    """
    if not os.path.exists(filepath):
        raise FileNotFoundError(f"PDF file not found: {filepath}")

    reader = pypdf.PdfReader(filepath)
    page_count = len(reader.pages)
    scanned_pages: List[int] = []
    markdown_sections: List[str] = []

    for i, page in enumerate(reader.pages, 1):
        page_text = page.extract_text() or ""
        clean_text = page_text.strip()

        # If page has fewer than 15 characters, flag as scanned or blank
        if len(clean_text) < 15:
            scanned_pages.append(i)
            markdown_sections.append(
                f"\n---\n\n> [!WARNING]\n> Page {i} has no embedded digital text (scanned document or image).\n"
            )
            continue

        parsed_page_md = parse_page_text_to_markdown(clean_text, i)
        if i == 1:
            markdown_sections.append(parsed_page_md)
        else:
            markdown_sections.append(f"\n---\n\n### Page {i}\n\n{parsed_page_md}")

    full_markdown = "\n\n".join(markdown_sections).strip()

    return {
        "markdown": full_markdown,
        "page_count": page_count,
        "has_scanned_pages": len(scanned_pages) > 0,
        "scanned_page_numbers": scanned_pages,
    }
