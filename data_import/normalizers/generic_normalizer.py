import re
import pandas as pd


def to_snake_case(name: str) -> str:
    """Convert column string to snake_case identifier."""
    s = re.sub(r"[^a-zA-Z0-9]+", "_", str(name)).strip("_").lower()
    return s if s else "column"


def normalize_generic_df(df: pd.DataFrame) -> pd.DataFrame:
    """Fallback normalizer: clean column headers to snake_case and remove empty rows."""
    new_cols = []
    seen = {}
    for col in df.columns:
        sc = to_snake_case(col)
        if sc in seen:
            seen[sc] += 1
            new_cols.append(f"{sc}_{seen[sc]}")
        else:
            seen[sc] = 1
            new_cols.append(sc)

    clean_df = df.copy()
    clean_df.columns = new_cols
    clean_df = clean_df.dropna(how="all")
    return clean_df
