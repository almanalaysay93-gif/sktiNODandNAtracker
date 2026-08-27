import ExcelJS from "exceljs";
import fs from "fs";
import path from "path";

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

async function audit() {
  const filePath = "C:/Users/Admin/Downloads/NN LDI DATABASE SUMMARY.xlsx";
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);

  console.log("=== COMPREHENSIVE SPREADSHEET TRAINING AUDIT ===");

  // 1. Audit sheet NURSES
  const nursesSheet = wb.getWorksheet("NURSES");
  const nurseTrainingsFound = new Map<string, number>();
  let nurseRowCount = 0;
  if (nursesSheet) {
    const colHeaders: { col: number; name: string }[] = [];
    const r3 = nursesSheet.getRow(3);
    const r4 = nursesSheet.getRow(4);
    const r5 = nursesSheet.getRow(5);

    for (let c = 6; c <= nursesSheet.columnCount; c++) {
      const t3 = getCellValue(r3.getCell(c));
      const t4 = getCellValue(r4.getCell(c));
      const t5 = getCellValue(r5.getCell(c));
      const combined = [t3, t4, t5].filter((t) => t && !/^\d{4}/.test(t) && t.length > 1).join(" - ") || t4 || t5 || t3;
      if (combined && combined.length > 2) {
        colHeaders.push({ col: c, name: combined });
      }
    }

    console.log(`\n[NURSES Sheet] Found ${colHeaders.length} training matrix columns:`);
    colHeaders.forEach((h, i) => console.log(`  ${i + 1}. [Col ${h.col}] ${h.name}`));

    let totalNurseCompletions = 0;
    for (let r = 6; r <= nursesSheet.rowCount; r++) {
      const row = nursesSheet.getRow(r);
      const name = getCellValue(row.getCell(2));
      if (!name || name.toUpperCase().includes("NURSE") || name.toUpperCase().includes("OFFICE") || name.toUpperCase().includes("WARD") || name.toUpperCase().includes("UNIT") || name.toUpperCase().includes("TRIAGE") || name.toUpperCase().includes("NAME")) continue;
      nurseRowCount++;

      for (const h of colHeaders) {
        const val = getCellValue(row.getCell(h.col));
        if (val && val !== "0" && val !== "-" && val.toLowerCase() !== "no") {
          totalNurseCompletions++;
          nurseTrainingsFound.set(h.name, (nurseTrainingsFound.get(h.name) || 0) + 1);
        }
      }
    }
    console.log(`[NURSES Sheet] Processed ${nurseRowCount} nurses, total training completions: ${totalNurseCompletions}`);
  }

  // 2. Audit sheet NURSING ATTENDANTS
  const naSheet = wb.getWorksheet("NURSING ATTENDANTS");
  let naRowCount = 0;
  let naCompletions = 0;
  if (naSheet) {
    const naHeaders: { col: number; name: string }[] = [];
    const r3 = naSheet.getRow(3);
    const r4 = naSheet.getRow(4);
    const r5 = naSheet.getRow(5);
    for (let c = 5; c <= naSheet.columnCount; c++) {
      const title = getCellValue(r4.getCell(c)) || getCellValue(r5.getCell(c)) || getCellValue(r3.getCell(c));
      if (title && title.length > 2 && !/^\d{4}/.test(title)) {
        naHeaders.push({ col: c, name: title });
      }
    }
    console.log(`\n[NURSING ATTENDANTS Sheet] Found ${naHeaders.length} matrix columns:`);
    naHeaders.forEach((h, i) => console.log(`  ${i + 1}. [Col ${h.col}] ${h.name}`));

    for (let r = 6; r <= naSheet.rowCount; r++) {
      const row = naSheet.getRow(r);
      const name = getCellValue(row.getCell(2)) || getCellValue(row.getCell(1));
      if (!name || name.toUpperCase().includes("ATTENDANT") || name.toUpperCase().includes("WARD") || name.toUpperCase().includes("UNIT") || name.toUpperCase().includes("NAME")) continue;
      naRowCount++;

      for (const h of naHeaders) {
        const val = getCellValue(row.getCell(h.col));
        if (val && val !== "0" && val !== "-" && val.toLowerCase() !== "no") {
          naCompletions++;
        }
      }
    }
    console.log(`[NURSING ATTENDANTS Sheet] Processed ${naRowCount} NAs, total training completions: ${naCompletions}`);
  }

  // 3. Audit 1ST & 2ND QUARTER SUMMARY
  const qSheets = ["1ST QUARTER SUMMARY", "2ND QUARTER SUMMARY"];
  let totalQuarterRows = 0;
  const quarterSeminars = new Map<string, number>();

  for (const qs of qSheets) {
    const ws = wb.getWorksheet(qs);
    if (!ws) continue;
    let sheetRows = 0;
    for (let r = 7; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const staffName = getCellValue(row.getCell(2));
      const titleCell = getCellValue(row.getCell(3));
      if (!staffName || !titleCell || staffName.toUpperCase().includes("NAME")) continue;

      const titles = titleCell.split(/\r?\n/).map((t) => t.trim()).filter((t) => t.length > 2);
      for (const t of titles) {
        sheetRows++;
        quarterSeminars.set(t, (quarterSeminars.get(t) || 0) + 1);
      }
    }
    console.log(`\n[${qs}] Total seminar attendances: ${sheetRows}`);
    totalQuarterRows += sheetRows;
  }
  console.log(`\n[Total Quarter Seminars Distinct]: ${quarterSeminars.size} unique titles, ${totalQuarterRows} total attendance entries.`);

  // 4. Audit RotationResignees
  const rotSheet = wb.getWorksheet("RotationResignees");
  let rotCount = 0;
  if (rotSheet) {
    for (let r = 2; r <= rotSheet.rowCount; r++) {
      const row = rotSheet.getRow(r);
      const name = getCellValue(row.getCell(3));
      if (name) rotCount++;
    }
    console.log(`\n[RotationResignees Sheet] Total records: ${rotCount}`);
  }
}

audit().catch(console.error);
