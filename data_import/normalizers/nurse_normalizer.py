import datetime
import re
from typing import Any, Dict, List, Optional, Tuple
import pandas as pd

SUFFIXES = {"JR", "JR.", "SR", "SR.", "II", "III", "IV", "V"}
SURNAME_PREFIXES = {"DE", "DEL", "DELA", "DE LA", "DELOS", "DE LOS", "SAN", "SANTA", "STA", "STA."}


def parse_filipino_name(name_str: Optional[str]) -> Tuple[str, str, Optional[str], Optional[str]]:
    """
    Parse Filipino name strings into (last_name, first_name, middle_name, suffix).
    Handles:
    - "DELA CRUZ, JUAN M."
    - "DELA CRUZ, JUAN M. JR."
    - "JUAN SANTOS DELA CRUZ JR."
    """
    if not name_str or not str(name_str).strip():
        return ("", "", None, None)

    raw = str(name_str).strip()
    suffix: Optional[str] = None
    middle: Optional[str] = None

    # Check comma format: "LAST, FIRST MIDDLE [SUFFIX]"
    if "," in raw:
        parts = [p.strip() for p in raw.split(",") if p.strip()]
        last_name = parts[0]
        remainder = " ".join(parts[1:]).strip() if len(parts) > 1 else ""

        rem_tokens = remainder.split()
        if rem_tokens and rem_tokens[-1].upper() in SUFFIXES:
            suffix = rem_tokens.pop().upper()

        if len(rem_tokens) == 0:
            first_name = ""
        elif len(rem_tokens) == 1:
            first_name = rem_tokens[0]
        else:
            # Check if last token is middle name / initial (e.g. "M." or "SANTOS")
            if len(rem_tokens[-1]) <= 2 or rem_tokens[-1].endswith("."):
                middle = rem_tokens.pop()
                first_name = " ".join(rem_tokens)
            elif len(rem_tokens) >= 3:
                middle = rem_tokens.pop()
                first_name = " ".join(rem_tokens)
            else:
                # 2 tokens: Could be "FIRST MIDDLE" or "FIRST FIRST"
                # Convention: if second token is 1 char or ends with dot, middle
                if len(rem_tokens[1]) <= 2 or rem_tokens[1].endswith("."):
                    middle = rem_tokens[1]
                    first_name = rem_tokens[0]
                else:
                    first_name = " ".join(rem_tokens)

        return (last_name.strip(), first_name.strip(), middle, suffix)

    # Space format without comma: "FIRST MIDDLE LAST [SUFFIX]"
    tokens = raw.split()
    if not tokens:
        return ("", "", None, None)

    if tokens[-1].upper() in SUFFIXES:
        suffix = tokens.pop().upper()

    if len(tokens) == 1:
        return (tokens[0], "", None, suffix)
    if len(tokens) == 2:
        return (tokens[1], tokens[0], None, suffix)

    # Check compound surname like "DELA CRUZ", "DE LA TORRE", "SAN JOSE"
    if len(tokens) >= 3 and tokens[-2].upper() in SURNAME_PREFIXES:
        last_name = f"{tokens[-2]} {tokens[-1]}"
        first_tokens = tokens[:-2]
    elif len(tokens) >= 4 and f"{tokens[-3].upper()} {tokens[-2].upper()}" in {"DE LA", "DE LOS"}:
        last_name = f"{tokens[-3]} {tokens[-2]} {tokens[-1]}"
        first_tokens = tokens[:-3]
    else:
        last_name = tokens[-1]
        first_tokens = tokens[:-1]

    if len(first_tokens) == 1:
        first_name = first_tokens[0]
        middle = None
    elif len(first_tokens) >= 2:
        if len(first_tokens[-1]) <= 2 or first_tokens[-1].endswith("."):
            middle = first_tokens.pop()
            first_name = " ".join(first_tokens)
        else:
            first_name = first_tokens[0]
            middle = " ".join(first_tokens[1:])
    else:
        first_name = ""

    return (last_name.strip(), first_name.strip(), middle, suffix)


def is_missing(val: Any) -> bool:
    """True for None, NaN, NaT and any other pandas null scalar."""
    if val is None:
        return True
    try:
        return bool(pd.isna(val))
    except (TypeError, ValueError):
        return False


def normalize_date(raw: Any) -> Optional[str]:
    """Parse raw date or Excel serial date into ISO YYYY-MM-DD string."""
    if is_missing(raw):
        return None
    s = str(raw).strip()
    if not s or s.lower() in {"none", "nan", "nat", "null", "n/a", "--", "-"}:
        return None

    # Check for pandas/datetime Timestamp or date object
    if isinstance(raw, (datetime.date, datetime.datetime, pd.Timestamp)):
        return raw.strftime("%Y-%m-%d")

    # Check for Excel serial number (e.g. 45500)
    try:
        val_float = float(s)
        if 20000 <= val_float <= 70000:
            dt = datetime.datetime(1899, 12, 30) + datetime.timedelta(days=val_float)
            return dt.strftime("%Y-%m-%d")
    except (ValueError, OverflowError):
        pass

    # Try standard string patterns
    for fmt in [
        "%Y-%m-%d", "%m/%d/%Y", "%d/%m/%Y", "%d-%b-%Y", "%d-%B-%Y",
        "%b %d, %Y", "%B %d, %Y", "%m-%d-%Y", "%Y/%m/%d"
    ]:
        try:
            dt = datetime.datetime.strptime(s, fmt)
            return dt.strftime("%Y-%m-%d")
        except ValueError:
            continue

    # Fallback to pandas parser
    try:
        dt = pd.to_datetime(s, errors="coerce")
        if pd.notnull(dt):
            return dt.strftime("%Y-%m-%d")
    except Exception:
        pass

    return None


def normalize_header(name: Any) -> str:
    """Lowercase a column name and collapse punctuation into single spaces."""
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", str(name).lower())).strip()


def _alias_in_header(alias: str, header: str) -> bool:
    """True when alias appears in header as a whole word sequence, not a substring.

    Substring matching lets short aliases such as "id" or "to" latch onto
    unrelated columns ("Valid Until", "Topic"), so require word boundaries.
    """
    if not alias or not header:
        return False
    return re.search(rf"(?:^|\s){re.escape(alias)}(?:$|\s)", header) is not None


def match_columns(columns: Any, header_map: Dict[str, List[str]]) -> Dict[str, Any]:
    """Map each canonical field to the original column name that best matches it.

    Exact normalized matches are resolved first so that a precise header always
    beats a loose one; the remaining fields then fall back to whole-word matches,
    longest alias first. Each source column is claimed by at most one field.
    """
    normalized = [(normalize_header(c), c) for c in columns]
    mapping: Dict[str, Any] = {}
    claimed: set = set()

    for canonical, aliases in header_map.items():
        alias_set = {normalize_header(a) for a in aliases}
        for clean_name, orig_name in normalized:
            if orig_name in claimed:
                continue
            if clean_name in alias_set:
                mapping[canonical] = orig_name
                claimed.add(orig_name)
                break

    for canonical, aliases in header_map.items():
        if canonical in mapping:
            continue
        ranked = sorted({normalize_header(a) for a in aliases}, key=len, reverse=True)
        matched = False
        for alias in ranked:
            for clean_name, orig_name in normalized:
                if orig_name in claimed:
                    continue
                if _alias_in_header(alias, clean_name):
                    mapping[canonical] = orig_name
                    claimed.add(orig_name)
                    matched = True
                    break
            if matched:
                break

    return mapping


def count_header_matches(df: pd.DataFrame, header_map: Dict[str, List[str]]) -> int:
    """Number of canonical fields in header_map that the DataFrame's columns supply."""
    return len(match_columns(df.columns, header_map))


def cell_text(raw_row: Any, column: Any) -> str:
    """Read a cell as a trimmed string, treating nulls and null-ish text as empty."""
    if column is None:
        return ""
    val = raw_row.get(column)
    if is_missing(val):
        return ""
    text = str(val).strip()
    return "" if text.lower() in {"none", "nan", "nat", "null"} else text


NURSE_HEADER_MAP: Dict[str, List[str]] = {
    "employee_id": ["emp id", "empid", "emp #", "employee id", "employee no", "staff id", "id number", "id"],
    "full_name": ["staff name", "nurse name", "full name", "employee name", "name"],
    "first_name": ["first name", "firstname", "given name"],
    "middle_name": ["middle name", "middlename", "m.i.", "mi"],
    "last_name": ["last name", "lastname", "surname", "family name"],
    "suffix": ["suffix", "ext", "extension"],
    "position": ["position", "designation", "job title", "title", "rank"],
    "area_name": ["ward", "area", "station", "unit", "department", "assigned area", "assigned unit"],
    "date_hired": ["date hired", "date joined", "hired date", "date of employment", "employment date"],
    "employment_status": ["status", "employment status", "employment type"],
    "contact_number": ["contact", "contact number", "mobile", "phone", "contact #"],
    "staff_type": ["staff type", "category", "nurse type"],
}


def is_nurse_roster(df: pd.DataFrame) -> bool:
    """Determine if a DataFrame resembles a nurse staff roster."""
    return count_header_matches(df, NURSE_HEADER_MAP) >= 3


# Values in a staff-type or category column that mean "Nursing Attendant".
ATTENDANT_TOKENS = {"na", "nc", "attendant", "aide", "orderly", "utility"}


def is_attendant(raw_staff_type: str, position: str, emp_id: str) -> bool:
    """Classify a row as a Nursing Attendant rather than a Registered Nurse.

    Matches whole tokens only: substring tests wrongly flag values such as
    "Renal Nurse" or "Analyst" because they happen to contain "na".
    """
    tokens = set(re.findall(r"[a-z]+", raw_staff_type.lower()))
    if tokens & ATTENDANT_TOKENS:
        return True
    if "attendant" in position.lower():
        return True
    return bool(re.match(r"^NA[^A-Za-z]*\d", emp_id.upper()))


def normalize_nurse_df(df: pd.DataFrame) -> pd.DataFrame:
    """Normalize raw roster DataFrame into canonical NurseTrack columns."""
    col_mapping = match_columns(df.columns, NURSE_HEADER_MAP)

    rows_data: List[Dict[str, Any]] = []
    for _, raw_row in df.iterrows():
        # Get raw values
        emp_id = cell_text(raw_row, col_mapping.get("employee_id"))
        if not emp_id:
            continue

        raw_name = cell_text(raw_row, col_mapping.get("full_name"))
        if "first_name" in col_mapping and "last_name" in col_mapping:
            first_name = cell_text(raw_row, col_mapping["first_name"])
            last_name = cell_text(raw_row, col_mapping["last_name"])
            middle_name = cell_text(raw_row, col_mapping.get("middle_name")) or None
            suffix = cell_text(raw_row, col_mapping.get("suffix")) or None
        else:
            last_name, first_name, middle_name, suffix = parse_filipino_name(raw_name)

        position = cell_text(raw_row, col_mapping.get("position"))
        area_name = cell_text(raw_row, col_mapping.get("area_name"))
        contact = cell_text(raw_row, col_mapping.get("contact_number"))

        # Determine staffType
        raw_staff_type = cell_text(raw_row, col_mapping.get("staff_type"))
        staff_type = "Nursing Attendant" if is_attendant(raw_staff_type, position, emp_id) else "Registered Nurse"

        # Determine employmentStatus
        raw_status = cell_text(raw_row, col_mapping.get("employment_status")).lower()
        if "regular" in raw_status or "permanent" in raw_status or "active" in raw_status or "contract" in raw_status:
            employment_status = "Active"
        elif "leave" in raw_status:
            employment_status = "On Leave"
        elif "resign" in raw_status:
            employment_status = "Resigned"
        elif "rotat" in raw_status:
            employment_status = "Rotated"
        elif "retir" in raw_status:
            employment_status = "Retired"
        else:
            employment_status = "Active"

        date_hired = normalize_date(raw_row.get(col_mapping.get("date_hired")))

        rows_data.append({
            "employee_id": emp_id,
            "first_name": first_name,
            "middle_name": middle_name,
            "last_name": last_name,
            "suffix": suffix,
            "position": position,
            "staff_type": staff_type,
            "area_name": area_name,
            "date_hired": date_hired,
            "employment_status": employment_status,
            "contact_number": contact,
        })

    return pd.DataFrame(rows_data, columns=[
        "employee_id", "first_name", "middle_name", "last_name", "suffix",
        "position", "staff_type", "area_name", "date_hired",
        "employment_status", "contact_number"
    ])
