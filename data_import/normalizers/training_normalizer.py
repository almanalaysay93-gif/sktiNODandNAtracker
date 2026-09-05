import re
from typing import Any, Dict, List, Optional
import pandas as pd
from data_import.normalizers.nurse_normalizer import (
    cell_text,
    count_header_matches,
    is_missing,
    match_columns,
    normalize_date,
)

TRAINING_ROLES = {"Participant", "Speaker", "Facilitator", "Preceptor"}

TRAINING_HEADER_MAP: Dict[str, List[str]] = {
    "training_name": ["training", "topic", "seminar", "title", "course", "subject", "training title", "seminar title"],
    "employee_id": ["emp id", "empid", "emp #", "employee id", "staff id", "id"],
    "nurse_name": ["nurse name", "staff name", "name", "full name", "participant"],
    "participation_role": ["role", "participation", "designation in seminar", "participation role"],
    "provider": ["provider", "institution", "sponsor", "organizer", "conducted by"],
    "status": ["status", "training status"],
    "completion_date": ["completion date", "date completed", "date taken", "date", "date finished"],
    "training_hours": ["training hours", "hours", "hrs", "duration", "hours completed"],
    "cpd_units": ["cpd units", "cpd", "units", "cpe units", "cpd points"],
    "certificate_number": ["certificate number", "certificate no", "cert #", "cert no", "certificate #"],
    "remarks": ["remarks", "notes", "comments"],
}


def clean_numeric(val: Any) -> Optional[float]:
    """Strip text annotations (e.g. '8 hrs', '4 CPD') and parse float."""
    if is_missing(val):
        return None
    s = str(val).strip()
    if not s or s.lower() in {"none", "nan", "nat", "null", "n/a", "--", "-"}:
        return None

    match = re.search(r"[-+]?\d*\.?\d+", s)
    if match:
        try:
            return float(match.group(0))
        except ValueError:
            return None
    return None


def is_training_sheet(df: pd.DataFrame) -> bool:
    """Determine if DataFrame contains training records."""
    return count_header_matches(df, TRAINING_HEADER_MAP) >= 3


def normalize_training_df(df: pd.DataFrame) -> pd.DataFrame:
    """Normalize raw training records into canonical NurseTrack schema."""
    col_mapping = match_columns(df.columns, TRAINING_HEADER_MAP)

    rows_data: List[Dict[str, Any]] = []
    for _, raw_row in df.iterrows():
        t_name = cell_text(raw_row, col_mapping.get("training_name"))
        if not t_name:
            continue

        emp_id = cell_text(raw_row, col_mapping.get("employee_id"))
        nurse_name = cell_text(raw_row, col_mapping.get("nurse_name"))

        # Normalize role
        raw_role = cell_text(raw_row, col_mapping.get("participation_role")).capitalize()
        matched_role = "Participant"
        for valid_role in TRAINING_ROLES:
            if valid_role.lower() in raw_role.lower():
                matched_role = valid_role
                break

        provider = cell_text(raw_row, col_mapping.get("provider"))

        # Normalize status
        raw_status = cell_text(raw_row, col_mapping.get("status")).capitalize()
        if "sched" in raw_status.lower():
            status = "Scheduled"
        elif "expir" in raw_status.lower():
            status = "Expired"
        elif "cancel" in raw_status.lower():
            status = "Cancelled"
        else:
            status = "Completed"

        completion_date = normalize_date(raw_row.get(col_mapping.get("completion_date")))
        hours = clean_numeric(raw_row.get(col_mapping.get("training_hours")))
        cpd = clean_numeric(raw_row.get(col_mapping.get("cpd_units")))
        cert_num = cell_text(raw_row, col_mapping.get("certificate_number"))
        remarks = cell_text(raw_row, col_mapping.get("remarks"))

        rows_data.append({
            "training_name": t_name,
            "employee_id": emp_id,
            "nurse_name": nurse_name,
            "participation_role": matched_role,
            "provider": provider,
            "status": status,
            "completion_date": completion_date,
            "training_hours": hours,
            "cpd_units": cpd,
            "certificate_number": cert_num,
            "remarks": remarks,
        })

    return pd.DataFrame(rows_data, columns=[
        "training_name", "employee_id", "nurse_name", "participation_role",
        "provider", "status", "completion_date", "training_hours",
        "cpd_units", "certificate_number", "remarks"
    ])
