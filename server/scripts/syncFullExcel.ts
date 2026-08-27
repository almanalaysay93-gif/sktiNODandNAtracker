import ExcelJS from "exceljs";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { canonicalAreaInfo, CANONICAL_AREAS } from "../deduplicate";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getCellValue(cell: ExcelJS.Cell | undefined): string {
  if (!cell || cell.value === null || cell.value === undefined) return "";
  if (typeof cell.value === "object") {
    if (cell.value instanceof Date) return cell.value.toISOString().slice(0, 10);
    if ((cell.value as any).result !== undefined) return String((cell.value as any).result || "").trim();
    if ((cell.value as any).text !== undefined) return String((cell.value as any).text || "").trim();
    if (Array.isArray((cell.value as any).richText)) {
      return (cell.value as any).richText.map((t: any) => t.text).join("").trim();
    }
  }
  return String(cell.value).trim();
}

function parseName(raw: string) {
  let clean = raw.replace(/\s+(RN|MAN|BSN|MD|LPT|NC\s*II)\b/gi, "").trim();
  clean = clean.replace(/\s+/g, " ");

  let lastName = "";
  let firstName = "";
  let middleName: string | null = null;
  let suffix: string | null = null;

  // Check suffix
  const suffixMatch = clean.match(/\b(JR\.?|SR\.?|III|II|IV)\b/i);
  if (suffixMatch) {
    suffix = suffixMatch[0].toUpperCase();
    clean = clean.replace(suffixMatch[0], "").trim();
  }

  if (clean.includes(",")) {
    const parts = clean.split(",");
    lastName = parts[0].trim();
    const rest = parts.slice(1).join(" ").trim().split(/\s+/);
    if (rest.length > 1 && rest[rest.length - 1].length <= 2) {
      middleName = rest.pop() || null;
      firstName = rest.join(" ");
    } else {
      firstName = rest.join(" ");
    }
  } else {
    const parts = clean.split(/\s+/);
    if (parts.length >= 2) {
      lastName = parts.pop() || "";
      if (parts.length > 1 && parts[parts.length - 1].length <= 2) {
        middleName = parts.pop() || null;
      }
      firstName = parts.join(" ");
    } else {
      firstName = clean;
      lastName = clean;
    }
  }

  return {
    fullName: raw.trim(),
    lastName: lastName.trim(),
    firstName: firstName.trim() || lastName.trim(),
    middleName: middleName?.replace(/\./g, "").trim() || null,
    suffix,
  };
}

async function extractWorkbookData() {
  const wb = new ExcelJS.Workbook();
  const filePath = "C:/Users/Admin/Downloads/NN LDI DATABASE SUMMARY.xlsx";
  await wb.xlsx.readFile(filePath);

  console.log("Reading workbook:", filePath);

  const staffMap = new Map<string, any>();
  const catalogMap = new Map<string, any>();
  const eventsList: any[] = [];

  // Helper to add/merge staff
  function addStaff(s: any) {
    const key = `${s.nameInfo.lastName} ${s.nameInfo.firstName}`.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!key) return;
    if (staffMap.has(key)) {
      const existing = staffMap.get(key);
      if (!existing.email && s.email) existing.email = s.email;
      if (!existing.licenseNumber && s.licenseNumber) existing.licenseNumber = s.licenseNumber;
      if (!existing.licenseExpiry && s.licenseExpiry) existing.licenseExpiry = s.licenseExpiry;
      if (s.currentAreaCode && existing.currentAreaCode === "NEPHRO-OFFICE") existing.currentAreaCode = s.currentAreaCode;
      if (s.matrixTrainings) {
        existing.matrixTrainings = { ...existing.matrixTrainings, ...s.matrixTrainings };
      }
    } else {
      staffMap.set(key, s);
    }
  }

  // 1. Process Sheet "NURSES"
  const nursesSheet = wb.getWorksheet("NURSES");
  if (nursesSheet) {
    let currentArea = "RDU Main";
    let trainingHeaders: { col: number; title: string }[] = [];

    // Scan row 4 and 5 for headers
    const row4 = nursesSheet.getRow(4);
    const row5 = nursesSheet.getRow(5);
    for (let c = 6; c <= nursesSheet.columnCount; c++) {
      const title = getCellValue(row4.getCell(c)) || getCellValue(row5.getCell(c));
      if (title && title.length > 2 && !/^\d{4}/.test(title)) {
        trainingHeaders.push({ col: c, title });
        const catKey = title.trim().toLowerCase();
        if (!catalogMap.has(catKey)) {
          catalogMap.set(catKey, {
            name: title.trim(),
            category: "Clinical Specialization",
            kind: "Training",
            renewalRequired: title.toLowerCase().includes("bls") || title.toLowerCase().includes("acls"),
            defaultValidityMonths: title.toLowerCase().includes("bls") || title.toLowerCase().includes("acls") ? 24 : null,
          });
        }
      }
    }

    for (let r = 6; r <= nursesSheet.rowCount; r++) {
      const row = nursesSheet.getRow(r);
      const col2 = getCellValue(row.getCell(2)); // Name or Area Header
      if (!col2) continue;

      const areaCheck = canonicalAreaInfo(col2);
      if (areaCheck && (col2.toUpperCase().includes("NURSE") || col2.toUpperCase().includes("OFFICE") || col2.toUpperCase().includes("WARD") || col2.toUpperCase().includes("UNIT") || col2.toUpperCase().includes("TRIAGE"))) {
        currentArea = areaCheck.name;
        continue;
      }

      const email = getCellValue(row.getCell(3));
      const prc = getCellValue(row.getCell(4));
      const exp = getCellValue(row.getCell(5));

      const nameInfo = parseName(col2);
      if (nameInfo.lastName.length < 2) continue;

      const matrixTrainings: Record<string, string> = {};
      for (const th of trainingHeaders) {
        const val = getCellValue(row.getCell(th.col));
        if (val && val !== "0" && val !== "-" && val.toLowerCase() !== "no") {
          matrixTrainings[th.title] = val;
        }
      }

      const areaInfo = canonicalAreaInfo(currentArea) || { code: "RDU-MAIN", name: "RDU Main" };

      addStaff({
        employeeId: prc || `RN-${staffMap.size + 1}`,
        nameInfo,
        email: email && email.includes("@") ? email : null,
        staffType: "Registered Nurse",
        position: "Staff Nurse II",
        employmentStatus: "Active",
        currentAreaCode: areaInfo.code,
        licenseNumber: prc || null,
        licenseExpiry: exp ? exp.slice(0, 10) : null,
        matrixTrainings,
      });
    }
  }

  // 2. Process Sheet "NURSING ATTENDANTS"
  const naSheet = wb.getWorksheet("NURSING ATTENDANTS") || wb.getWorksheet("List of All Nursing Attendants ");
  if (naSheet) {
    let currentArea = "RDU Main";
    for (let r = 1; r <= naSheet.rowCount; r++) {
      const row = naSheet.getRow(r);
      const col1 = getCellValue(row.getCell(1));
      const col2 = getCellValue(row.getCell(2));
      const nameRaw = col2 || col1;
      if (!nameRaw || nameRaw.length < 3) continue;

      const areaCheck = canonicalAreaInfo(nameRaw);
      if (areaCheck && (nameRaw.toUpperCase().includes("ATTENDANT") || nameRaw.toUpperCase().includes("NA") || nameRaw.toUpperCase().includes("WARD") || nameRaw.toUpperCase().includes("UNIT"))) {
        currentArea = areaCheck.name;
        continue;
      }

      if (nameRaw.toUpperCase().includes("NAME") || nameRaw.toUpperCase().includes("DATABASE") || nameRaw.toUpperCase().includes("SUMMARY")) continue;

      const nameInfo = parseName(nameRaw);
      if (nameInfo.lastName.length < 2) continue;

      const prc = getCellValue(row.getCell(4)) || getCellValue(row.getCell(3));
      const exp = getCellValue(row.getCell(5));
      const email = getCellValue(row.getCell(3));

      const areaInfo = canonicalAreaInfo(currentArea) || { code: "RDU-MAIN", name: "RDU Main" };

      addStaff({
        employeeId: prc && /^\d+$/.test(prc) ? prc : `NA-${staffMap.size + 1}`,
        nameInfo,
        email: email && email.includes("@") ? email : null,
        staffType: "Nursing Attendant",
        position: "Nursing Attendant I",
        employmentStatus: "Active",
        currentAreaCode: areaInfo.code,
        licenseNumber: prc || null,
        licenseExpiry: exp ? exp.slice(0, 10) : null,
      });
    }
  }

  // 3. Process Sheet "RotationResignees"
  const rotSheet = wb.getWorksheet("RotationResignees");
  if (rotSheet) {
    for (let r = 2; r <= rotSheet.rowCount; r++) {
      const row = rotSheet.getRow(r);
      const statusType = getCellValue(row.getCell(1)); // ROTATION or RESIGNEE
      const nameRaw = getCellValue(row.getCell(3));
      if (!nameRaw) continue;

      const nameInfo = parseName(nameRaw);
      const email = getCellValue(row.getCell(4));
      const prc = getCellValue(row.getCell(5));
      const exp = getCellValue(row.getCell(6));

      addStaff({
        employeeId: prc || `ROT-${staffMap.size + 1}`,
        nameInfo,
        email: email && email.includes("@") ? email : null,
        staffType: "Registered Nurse",
        position: "Staff Nurse II",
        employmentStatus: statusType.toUpperCase().includes("ROTAT") ? "Rotated" : "Resigned",
        currentAreaCode: "NEPHRO-OFFICE",
        licenseNumber: prc || null,
        licenseExpiry: exp ? exp.slice(0, 10) : null,
      });
    }
  }

  // 4. Process Q1 and Q2 LDI Summaries
  const quarterSheets = ["1ST QUARTER SUMMARY", "2ND QUARTER SUMMARY"];
  for (const qSheetName of quarterSheets) {
    const qSheet = wb.getWorksheet(qSheetName);
    if (!qSheet) continue;

    for (let r = 7; r <= qSheet.rowCount; r++) {
      const row = qSheet.getRow(r);
      const staffName = getCellValue(row.getCell(2));
      const rawTitleCell = getCellValue(row.getCell(3));
      const rawDateCell = getCellValue(row.getCell(4));
      const provider = getCellValue(row.getCell(5)) || "SPMC";

      if (!staffName || !rawTitleCell || staffName.toUpperCase().includes("NAME")) continue;

      const normNameKey = `${parseName(staffName).lastName.toUpperCase()}, ${parseName(staffName).firstName.toUpperCase()}`;

      // Split multiple titles in a single cell by newlines
      const titles = rawTitleCell
        .split(/\r?\n/)
        .map((t) => t.trim())
        .filter((t) => t.length > 2);

      const dates = rawDateCell
        .split(/\r?\n/)
        .map((d) => d.trim())
        .filter(Boolean);

      for (let idx = 0; idx < titles.length; idx++) {
        const fullTitle = titles[idx];
        const singleTitle = fullTitle.slice(0, 120).trim();
        const dateText = dates[idx] || dates[0] || rawDateCell;

        const catKey = singleTitle.toLowerCase();
        if (!catalogMap.has(catKey)) {
          catalogMap.set(catKey, {
            name: singleTitle,
            category: singleTitle.toLowerCase().includes("privacy") || singleTitle.toLowerCase().includes("space") ? "Mandatory / Hospital Compliance" : "Clinical Specialization",
            kind: "Seminar",
            renewalRequired: false,
            defaultValidityMonths: null,
          });
        }

        // Parse date
        let dateIso = "2026-03-15";
        const isoMatch = dateText.match(/2026-\d{2}-\d{2}/);
        if (isoMatch) {
          dateIso = isoMatch[0];
        } else if (dateText.match(/jan/i)) dateIso = "2026-01-15";
        else if (dateText.match(/feb/i)) dateIso = "2026-02-15";
        else if (dateText.match(/mar/i)) dateIso = "2026-03-15";
        else if (dateText.match(/apr/i)) dateIso = "2026-04-15";
        else if (dateText.match(/may/i)) dateIso = "2026-05-15";
        else if (dateText.match(/jun/i)) dateIso = "2026-06-15";

        // Find or create event
        let event = eventsList.find((e) => e.title === singleTitle && e.startDate === dateIso);
        if (!event) {
          event = {
            title: singleTitle,
            startDate: dateIso,
            endDate: dateIso,
            provider,
            venue: "SPMC / Online",
            attendees: [],
          };
          eventsList.push(event);
        }

        event.attendees.push({
          staffName,
          normName: normNameKey,
          role: "Participant",
          completionDate: dateIso,
        });
      }
    }
  }

  const finalStaff = Array.from(staffMap.values());
  const finalCatalog = Array.from(catalogMap.values());

  console.log(`Extracted: ${finalStaff.length} staff, ${finalCatalog.length} catalog items, ${eventsList.length} events.`);

  const seedPayload = {
    areas: CANONICAL_AREAS.map((a) => ({
      code: a.code,
      name: a.name,
      description: a.description,
      sortOrder: a.sortOrder,
    })),
    trainingCatalog: finalCatalog,
    staff: finalStaff,
    events: eventsList,
  };

  const outPath = path.resolve(__dirname, "../data/seedData.json");
  fs.writeFileSync(outPath, JSON.stringify(seedPayload, null, 2), "utf8");
  console.log("Successfully wrote complete seedData.json to:", outPath);
}

extractWorkbookData().catch(console.error);
