import unittest
import pandas as pd

from data_import.normalizers.nurse_normalizer import (
    parse_filipino_name,
    normalize_date,
    normalize_nurse_df,
    is_nurse_roster,
)
from data_import.normalizers.training_normalizer import (
    normalize_training_df,
    is_training_sheet,
    clean_numeric,
)
from data_import.normalizers.generic_normalizer import normalize_generic_df


class TestNormalizers(unittest.TestCase):
    def test_parse_filipino_name_cases(self):
        # Format 1: "LAST, FIRST MIDDLE"
        last, first, middle, suffix = parse_filipino_name("DELA CRUZ, JUAN M.")
        self.assertEqual(last, "DELA CRUZ")
        self.assertEqual(first, "JUAN")
        self.assertEqual(middle, "M.")
        self.assertIsNone(suffix)

        # Format 2: "LAST, FIRST MIDDLE SUFFIX"
        last, first, middle, suffix = parse_filipino_name("DELA CRUZ, JUAN M. JR.")
        self.assertEqual(last, "DELA CRUZ")
        self.assertEqual(first, "JUAN")
        self.assertEqual(middle, "M.")
        self.assertEqual(suffix, "JR.")

        # Format 3: "FIRST MIDDLE LAST JR."
        last, first, middle, suffix = parse_filipino_name("JUAN SANTOS DELA CRUZ JR.")
        self.assertEqual(last, "DELA CRUZ")
        self.assertEqual(first, "JUAN")
        self.assertEqual(suffix, "JR.")

        # Format 4: "LAST, FIRST"
        last, first, middle, suffix = parse_filipino_name("REYES, MARIA")
        self.assertEqual(last, "REYES")
        self.assertEqual(first, "MARIA")
        self.assertIsNone(middle)

    def test_normalize_date(self):
        self.assertEqual(normalize_date("2026-08-15"), "2026-08-15")
        self.assertEqual(normalize_date("08/15/2026"), "2026-08-15")
        self.assertEqual(normalize_date("15-Aug-2026"), "2026-08-15")
        self.assertEqual(normalize_date("August 15, 2026"), "2026-08-15")
        # Excel serial integer: 45500 -> 2024-07-22
        self.assertIsNotNone(normalize_date(45500))
        # Empty/invalid
        self.assertIsNone(normalize_date(None))
        self.assertIsNone(normalize_date(""))
        self.assertIsNone(normalize_date("N/A"))

    def test_clean_numeric(self):
        self.assertEqual(clean_numeric("8 hrs"), 8.0)
        self.assertEqual(clean_numeric("3.5 CPD"), 3.5)
        self.assertEqual(clean_numeric(16), 16.0)
        self.assertIsNone(clean_numeric(None))
        self.assertIsNone(clean_numeric("None"))

    def test_nurse_normalizer(self):
        raw_df = pd.DataFrame([
            {
                "Emp #": "RN-001",
                "Staff Name": "DELA CRUZ, JUAN M.",
                "Ward": "Intensive Care Unit",
                "Designation": "Staff Nurse II",
                "Date Joined": "01/15/2020",
                "Status": "Regular",
                "Contact": "09171234567",
            },
            {
                "Emp #": "NA-002",
                "Staff Name": "SANTOS, MARIA",
                "Ward": "Emergency Room",
                "Designation": "Nursing Attendant I",
                "Date Joined": "2022-03-01",
                "Status": "Active",
                "Contact": None,
            },
        ])

        self.assertTrue(is_nurse_roster(raw_df))

        norm_df = normalize_nurse_df(raw_df)
        expected_cols = [
            "employee_id", "first_name", "middle_name", "last_name", "suffix",
            "position", "staff_type", "area_name", "date_hired",
            "employment_status", "contact_number"
        ]
        self.assertEqual(list(norm_df.columns), expected_cols)

        # First row checks
        r1 = norm_df.iloc[0]
        self.assertEqual(r1["employee_id"], "RN-001")
        self.assertEqual(r1["first_name"], "JUAN")
        self.assertEqual(r1["last_name"], "DELA CRUZ")
        self.assertEqual(r1["staff_type"], "Registered Nurse")
        self.assertEqual(r1["area_name"], "Intensive Care Unit")
        self.assertEqual(r1["employment_status"], "Active")
        self.assertEqual(r1["date_hired"], "2020-01-15")

        # Second row checks (NA)
        r2 = norm_df.iloc[1]
        self.assertEqual(r2["employee_id"], "NA-002")
        self.assertEqual(r2["staff_type"], "Nursing Attendant")

    def test_training_normalizer(self):
        raw_df = pd.DataFrame([
            {
                "Emp ID": "RN-001",
                "Nurse Name": "Juan Dela Cruz",
                "Topic": "Basic Life Support",
                "Role": "participant",
                "Hours": "8 hours",
                "CPD Units": "4.0",
                "Date Completed": "2026-05-10",
                "Certificate No": "CERT-2026-001",
            }
        ])

        self.assertTrue(is_training_sheet(raw_df))
        norm_df = normalize_training_df(raw_df)

        expected_cols = [
            "training_name", "employee_id", "nurse_name", "participation_role",
            "provider", "status", "completion_date", "training_hours",
            "cpd_units", "certificate_number", "remarks"
        ]
        self.assertEqual(list(norm_df.columns), expected_cols)

        row = norm_df.iloc[0]
        self.assertEqual(row["training_name"], "Basic Life Support")
        self.assertEqual(row["employee_id"], "RN-001")
        self.assertEqual(row["participation_role"], "Participant")
        self.assertEqual(row["training_hours"], 8.0)
        self.assertEqual(row["cpd_units"], 4.0)
        self.assertEqual(row["completion_date"], "2026-05-10")

    def test_generic_normalizer(self):
        raw_df = pd.DataFrame([
            {"Sample Header 1": "Val 1", "Sample & Header #2": "Val 2"}
        ])
        norm_df = normalize_generic_df(raw_df)
        self.assertEqual(list(norm_df.columns), ["sample_header_1", "sample_header_2"])
        self.assertEqual(norm_df.iloc[0]["sample_header_1"], "Val 1")


if __name__ == "__main__":
    unittest.main()
