/** Turns an uploaded file (any supported type) into plain text for the AI extraction step. */
import * as XLSX from "exceljs";

export type ExtractMethod = "pdf-text" | "ocr" | "spreadsheet" | "docx" | "plain";

export type ExtractResult = { text: string; method: ExtractMethod };

const MIN_PDF_TEXT_LENGTH = 20;

export async function extractText(buffer: Buffer, mimeType: string, fileName: string): Promise<ExtractResult> {
  if (mimeType === "application/pdf" || fileName.toLowerCase().endsWith(".pdf")) {
    return extractPdf(buffer);
  }
  if (mimeType.startsWith("image/")) {
    return extractImage(buffer);
  }
  if (
    mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mimeType === "application/vnd.ms-excel" ||
    /\.(xlsx|xls)$/i.test(fileName)
  ) {
    return extractSpreadsheet(buffer);
  }
  if (mimeType === "text/csv" || mimeType === "application/csv" || fileName.toLowerCase().endsWith(".csv")) {
    return { text: buffer.toString("utf-8"), method: "spreadsheet" };
  }
  if (
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    fileName.toLowerCase().endsWith(".docx")
  ) {
    return extractDocx(buffer);
  }
  return { text: buffer.toString("utf-8"), method: "plain" };
}

async function extractPdf(buffer: Buffer): Promise<ExtractResult> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    const text = (result.text ?? "").trim();
    if (text.length >= MIN_PDF_TEXT_LENGTH) {
      return { text, method: "pdf-text" };
    }
    throw new Error(
      "This PDF has no extractable text layer (likely a scanned document). Export/print it as a JPG or PNG image and upload that instead so it can be read with OCR.",
    );
  } finally {
    await parser.destroy();
  }
}

async function extractImage(buffer: Buffer): Promise<ExtractResult> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng");
  try {
    const {
      data: { text },
    } = await worker.recognize(buffer);
    return { text: text.trim(), method: "ocr" };
  } finally {
    await worker.terminate();
  }
}

async function extractSpreadsheet(buffer: Buffer): Promise<ExtractResult> {
  const workbook = new XLSX.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const lines: string[] = [];
  for (const sheet of workbook.worksheets) {
    lines.push(`Sheet: ${sheet.name}`);
    const headerRow = sheet.getRow(1);
    const headers = headerRow.values as unknown[];
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const cells: string[] = [];
      row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        const header = typeof headers[colNumber] === "string" ? (headers[colNumber] as string) : `col${colNumber}`;
        const value = cell.value instanceof Date ? cell.value.toISOString().slice(0, 10) : String(cell.value ?? "").trim();
        if (value) cells.push(`${header}=${value}`);
      });
      if (cells.length) lines.push(`Row ${rowNumber}: ${cells.join(", ")}`);
    });
  }
  return { text: lines.join("\n"), method: "spreadsheet" };
}

async function extractDocx(buffer: Buffer): Promise<ExtractResult> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer });
  return { text: result.value.trim(), method: "docx" };
}
