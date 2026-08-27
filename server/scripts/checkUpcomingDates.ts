import ExcelJS from "exceljs";

function getCellValue(cell: any): string {
  if (!cell || cell.value === null || cell.value === undefined) return "";
  if (typeof cell.value === "object") {
    if (cell.value instanceof Date) return cell.value.toISOString().slice(0, 10);
    if (cell.value.result !== undefined) return String(cell.value.result || "").trim();
    if (cell.value.text !== undefined) return String(cell.value.text || "").trim();
    if (Array.isArray(cell.value.richText)) {
      return cell.value.richText.map((t: any) => t.text).join("").trim();
    }
  }
  return String(cell.value).trim();
}

async function checkUpcoming() {
  const filePath = "C:/Users/Admin/Downloads/NN LDI DATABASE SUMMARY.xlsx";
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);

  console.log("=== CHECKING DATES ACROSS ALL SHEETS IN SPREADSHEET ===");
  const today = "2026-08-27";
  console.log("Current System Date:", today);

  for (const ws of wb.worksheets) {
    console.log(`\n--- Inspecting Sheet: "${ws.name}" ---`);
    const futureDates: { row: number; col: number; val: string }[] = [];
    const allDatesFound = new Set<string>();

    for (let r = 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      for (let c = 1; c <= ws.columnCount; c++) {
        const val = getCellValue(row.getCell(c));
        if (!val) continue;

        // Check for date patterns (e.g. 2026-09, 2026-10, September, October, Nov, Dec, 2027, etc.)
        const matchIso = val.match(/202[6-9]-\d{2}-\d{2}/);
        if (matchIso) {
          allDatesFound.add(matchIso[0]);
          if (matchIso[0] >= today) {
            futureDates.push({ row: r, col: c, val });
          }
        }
        if (/(september|october|november|december)\s+\d+/i.test(val) && !val.includes("2025") && !val.includes("2024") && !val.includes("2023")) {
          futureDates.push({ row: r, col: c, val });
        }
      }
    }

    const sortedDates = Array.from(allDatesFound).sort();
    console.log(`  Dates range found in this sheet: ${sortedDates[0] ?? "None"} to ${sortedDates[sortedDates.length - 1] ?? "None"} (Total distinct ISO dates: ${sortedDates.length})`);
    if (futureDates.length > 0) {
      console.log(`  Found ${futureDates.length} future/upcoming date entries:`);
      futureDates.slice(0, 10).forEach((f) => console.log(`    Row ${f.row}, Col ${f.col}: "${f.val}"`));
    } else {
      console.log(`  No future/upcoming training dates found in this sheet (all training dates are <= June 2026).`);
    }
  }
}

checkUpcoming().catch(console.error);
