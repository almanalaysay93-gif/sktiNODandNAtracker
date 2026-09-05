import re
from typing import Any, Dict, List, Optional
import pandas as pd
from data_import.normalizers.nurse_normalizer import (
    cell_text,
    count_header_matches,
    match_columns,
    normalize_date,
)
from data_import.normalizers.training_normalizer import TRAINING_ROLES, clean_numeric

SEMINAR_HEADER_MAP: Dict[str, List[str]] = {
    "seminar_title": ["seminar title", "seminar", "event", "program title", "topic"],
    "start_date": ["start date", "date started", "from", "schedule"],
    "end_date": ["end date", "date ended", "to"],
    "venue": ["venue", "location", "room"],
    "provider": ["provider", "sponsor", "organizer"],
    "employee_id": ["emp id", "empid", "emp #", "employee id", "staff id", "id"],
    "nurse_name": ["attendee", "participant", "staff name", "nurse name", "name"],
    "role": ["role", "participation role", "designation"],
    "completion_date": ["completion date", "date attended", "date completed", "date"],
}


def is_seminar_sheet(df: pd.DataFrame) -> bool:
    """Determine if DataFrame contains seminar attendance or events."""
    cols_clean = [str(c).strip().lower() for c in df.columns]
    matches = count_header_matches(df, SEMINAR_HEADER_MAP)
    return matches >= 3 and any("seminar" in col or "attend" in col or "event" in col for col in cols_clean)


def normalize_seminar_df(df: pd.DataFrame) -> pd.DataFrame:
    """Normalize seminar event and attendance rows."""
    col_mapping = match_columns(df.columns, SEMINAR_HEADER_MAP)

    rows_data: List[Dict[str, Any]] = []
    for _, raw_row in df.iterrows():
        title = cell_text(raw_row, col_mapping.get("seminar_title"))
        emp_id = cell_text(raw_row, col_mapping.get("employee_id"))
        nurse_name = cell_text(raw_row, col_mapping.get("nurse_name"))

        if not title and not emp_id and not nurse_name:
            continue

        raw_role = cell_text(raw_row, col_mapping.get("role")).capitalize()
        matched_role = "Participant"
        for valid_role in TRAINING_ROLES:
            if valid_role.lower() in raw_role.lower():
                matched_role = valid_role
                break

        rows_data.append({
            "seminar_title": title,
            "start_date": normalize_date(raw_row.get(col_mapping.get("start_date"))),
            "end_date": normalize_date(raw_row.get(col_mapping.get("end_date"))),
            "venue": cell_text(raw_row, col_mapping.get("venue")),
            "provider": cell_text(raw_row, col_mapping.get("provider")),
            "employee_id": emp_id,
            "nurse_name": nurse_name,
            "participation_role": matched_role,
            "completion_date": normalize_date(raw_row.get(col_mapping.get("completion_date"))),
        })

    return pd.DataFrame(rows_data, columns=[
        "seminar_title", "start_date", "end_date", "venue", "provider",
        "employee_id", "nurse_name", "participation_role", "completion_date"
    ])
