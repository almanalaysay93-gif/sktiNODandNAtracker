import os
import shutil
import tempfile
import unittest
import openpyxl
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas

from data_import.convert import run_conversion_pipeline


class TestPipelineE2E(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.inputs_dir = os.path.join(self.temp_dir.name, "inputs")
        self.outputs_dir = os.path.join(self.temp_dir.name, "outputs")
        os.makedirs(self.inputs_dir, exist_ok=True)
        os.makedirs(self.outputs_dir, exist_ok=True)

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_full_pipeline_with_excel_and_pdf(self):
        # 1. Create a sample Excel roster with 2 sheets
        excel_path = os.path.join(self.inputs_dir, "staff_roster.xlsx")
        wb = openpyxl.Workbook()

        # Sheet 1: Nurses
        ws1 = wb.active
        ws1.title = "Nurses"
        ws1.append(["Emp ID", "Full Name", "Ward", "Position", "Date Hired", "Status"])
        ws1.append(["RN-101", "Dela Cruz, Juan M.", "ICU", "Staff Nurse II", "2021-01-10", "Active"])
        ws1.append(["NA-201", "Santos, Maria", "ER", "Nursing Attendant", "2022-05-15", "Active"])

        # Sheet 2: BLS Trainings
        ws2 = wb.create_sheet("Trainings")
        ws2.append(["Emp ID", "Nurse Name", "Topic", "Role", "Hours", "Date Completed"])
        ws2.append(["RN-101", "Dela Cruz, Juan M.", "Basic Life Support", "Participant", "8", "2026-02-20"])

        wb.save(excel_path)

        # 2. Create a sample PDF memo
        pdf_path = os.path.join(self.inputs_dir, "seminar_announcement.pdf")
        c = canvas.Canvas(pdf_path, pagesize=letter)
        c.setFont("Helvetica-Bold", 14)
        c.drawString(72, 750, "INFECTION CONTROL SEMINAR")
        c.setFont("Helvetica", 11)
        c.drawString(72, 720, "Date: 2026-09-15")
        c.drawString(72, 700, "Venue: Main Auditorium")
        c.drawString(72, 670, "Employee ID | Full Name | Role")
        c.drawString(72, 650, "RN-101 | Juan Dela Cruz | Participant")
        c.showPage()
        c.save()

        # 3. Run pipeline
        summary = run_conversion_pipeline(
            inputs_dir=self.inputs_dir,
            outputs_dir=self.outputs_dir,
            archive_after_run=True,
        )

        self.assertEqual(summary["total_files"], 2)
        self.assertEqual(summary["excel_processed"], 1)
        self.assertEqual(summary["pdf_processed"], 1)

        # 4. Assert generated CSVs
        nurse_csv = os.path.join(self.outputs_dir, "nurses", "staff_roster_nurses.csv")
        self.assertTrue(os.path.exists(nurse_csv), f"Expected {nurse_csv} to exist")

        training_csv = os.path.join(self.outputs_dir, "trainings", "staff_roster_trainings.csv")
        self.assertTrue(os.path.exists(training_csv), f"Expected {training_csv} to exist")

        # 5. Assert generated Markdown
        pdf_md = os.path.join(self.outputs_dir, "markdown", "seminar_announcement.md")
        self.assertTrue(os.path.exists(pdf_md), f"Expected {pdf_md} to exist")

        # 6. Assert files moved to archive
        archive_root = os.path.join(self.inputs_dir, "archive")
        self.assertTrue(os.path.exists(archive_root))
        # Original inputs folder should no longer have the files
        self.assertFalse(os.path.exists(excel_path))
        self.assertFalse(os.path.exists(pdf_path))


if __name__ == "__main__":
    unittest.main()
