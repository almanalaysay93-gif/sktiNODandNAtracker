import ExcelJS from "exceljs";

function getCellValue(cell) {
  if (!cell || cell.value === null || cell.value === undefined) return "";
  if (typeof cell.value === "object") {
    if (cell.value instanceof Date) return cell.value.toISOString();
    if (cell.value.result !== undefined) return String(cell.value.result || "");
    if (cell.value.text !== undefined) return String(cell.value.text || "");
    if (Array.isArray(cell.value.richText)) {
      return cell.value.richText.map((t) => t.text).join("");
    }
  }
  return String(cell.value).trim();
}

async function main() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile("C:/Users/Admin/Downloads/NN LDI DATABASE SUMMARY.xlsx");
  console.log("=== WORKBOOK OVERVIEW ===");
  console.log("Worksheet names:", wb.worksheets.map((ws) => ws.name));

  for (const ws of wb.worksheets) {
    console.log(`\n========================================`);
    console.log(`SHEET: "${ws.name}" (${ws.rowCount} rows, ${ws.columnCount} cols)`);
    console.log(`========================================`);

    // Print first 12 rows
    for (let r = 1; r <= Math.min(15, ws.rowCount); r++) {
      const row = ws.getRow(r);
      const vals = [];
      for (let c = 1; c <= Math.min(25, ws.columnCount); c++) {
        const val = getCellValue(row.getCell(c));
        if (val) vals.push(`[col${c}] ${val}`);
      }
      if (vals.length > 0) {
        console.log(`Row ${r}: ${vals.join(" | ")}`);
      }
    }
  }
}

main().catch(console.error);
