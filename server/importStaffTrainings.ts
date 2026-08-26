import type { Request, Response } from "express";
import { z } from "zod";
import { sdk } from "./_core/sdk";
import * as db from "./db";

const rowSchema = z.object({
  fullName: z.string().min(1).max(256),
  title: z.string().min(1).max(512),
  dateText: z.string().max(256).optional(),
  provider: z.string().max(128).optional(),
  quarter: z.string().max(32),
});
const bodySchema = z.object({ rows: z.array(rowSchema).max(1000) });

// Order-independent token-set match: HR sheets write names as
// "LAST, First Middle", nurse records store first/middle/last separately.
function normTokenSet(s: string): string {
  return s
    .split(",")
    .join(" ")
    .split(/\s+/)
    .map((t) => t.toLowerCase().replace(/[^a-z0-9]/g, ""))
    .filter(Boolean)
    .sort()
    .join("|");
}

function rowShortKey(fullName: string): string {
  const [lastPart, ...restParts] = fullName.split(",");
  if (restParts.length === 0) return normTokenSet(fullName);
  const firstToken = restParts.join(",").trim().split(/\s+/)[0] ?? "";
  return normTokenSet(`${firstToken} ${lastPart}`);
}

const MONTHS = "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";

/** Best-effort date extraction from messy free-text HR date/time cells. */
function parseBestEffortDate(text: string | undefined): Date | null {
  if (!text) return null;
  // Already an ISO string (e.g. from an Excel date cell).
  if (/^\d{4}-\d{2}-\d{2}T/.test(text)) {
    const d = new Date(text);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const monthMatch = text.match(new RegExp(`\\b(${MONTHS})\\b`, "i"));
  const yearMatch = text.match(/\b(20\d{2})\b/);
  if (monthMatch && yearMatch) {
    const afterMonth = text.slice((monthMatch.index ?? 0) + monthMatch[0].length);
    const dayMatch = afterMonth.match(/\d{1,2}/);
    if (dayMatch) {
      const d = new Date(`${monthMatch[0]} ${dayMatch[0]}, ${yearMatch[1]}`);
      if (!Number.isNaN(d.getTime())) return d;
    }
  }
  // "MM/DD.../YY" style with no month name.
  const slashMatch = text.match(/^(\d{1,2})\/(\d{1,2})(?:[-,]\d{1,2})*\/(\d{2,4})/);
  if (slashMatch) {
    const month = Number(slashMatch[1]);
    const day = Number(slashMatch[2]);
    let year = Number(slashMatch[3]);
    if (year < 100) year += 2000;
    const d = new Date(year, month - 1, day);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

/**
 * Admin-only bulk training/seminar import: creates a trainingCatalog entry
 * per unique title and one nurseTrainings participation record per
 * (nurse, title, date) row, matched to already-imported nurses by
 * normalized full name. Idempotent: re-running skips rows already recorded
 * for that nurse+training+remarks combination.
 */
export async function importStaffTrainingsHandler(req: Request, res: Response) {
  try {
    let user;
    try {
      user = await sdk.authenticateRequest(req);
    } catch {
      return res.status(403).json({ error: "not-authenticated" });
    }
    if (user.role !== "admin") {
      return res.status(403).json({ error: "admin-only" });
    }
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "invalid-body", details: parsed.error.flatten() });
    }

    const nurses = await db.listNurses();
    const byFullKey = new Map<string, typeof nurses>();
    const byShortKey = new Map<string, typeof nurses>();
    for (const n of nurses) {
      const full = normTokenSet(`${n.firstName} ${n.middleName ?? ""} ${n.lastName} ${n.suffix ?? ""}`);
      const short = normTokenSet(`${n.firstName} ${n.lastName}`);
      if (!byFullKey.has(full)) byFullKey.set(full, []);
      byFullKey.get(full)!.push(n);
      if (!byShortKey.has(short)) byShortKey.set(short, []);
      byShortKey.get(short)!.push(n);
    }

    const catalogIdByName = new Map<string, number>();
    for (const t of await db.listTrainingCatalog(true)) catalogIdByName.set(t.name, t.id);

    const existing = await db.listNurseTrainings();
    const existingKeys = new Set(existing.map((e) => `${e.nurseId}:${e.trainingId}:${e.remarks ?? ""}`));

    let created = 0;
    let skippedDuplicate = 0;
    let notFound = 0;
    let ambiguous = 0;
    const unmatched: string[] = [];

    for (const row of parsed.data.rows) {
      const fullKey = normTokenSet(row.fullName);
      let candidates = byFullKey.get(fullKey) ?? [];
      if (candidates.length === 0) candidates = byShortKey.get(rowShortKey(row.fullName)) ?? [];
      if (candidates.length === 0) {
        notFound++;
        unmatched.push(row.fullName);
        continue;
      }
      const uniqueIds = Array.from(new Set(candidates.map((c) => c.id)));
      if (uniqueIds.length > 1) {
        ambiguous++;
        unmatched.push(row.fullName);
        continue;
      }
      const nurse = candidates[0]!;

      const title = row.title.trim();
      let trainingId = catalogIdByName.get(title);
      if (!trainingId) {
        trainingId = await db.createTrainingType({ name: title, kind: "Seminar" });
        catalogIdByName.set(title, trainingId);
      }

      const remarks = `${row.quarter}: ${row.dateText ?? ""}`.trim();
      const dedupeKey = `${nurse.id}:${trainingId}:${remarks}`;
      if (existingKeys.has(dedupeKey)) {
        skippedDuplicate++;
        continue;
      }

      const completionDate = parseBestEffortDate(row.dateText);
      await db.createNurseTraining({
        nurseId: nurse.id,
        trainingId,
        status: "Completed",
        completionDate,
        provider: row.provider,
        remarks,
      });
      existingKeys.add(dedupeKey);
      created++;
    }

    res.json({ ok: true, created, skippedDuplicate, notFound, ambiguous, unmatched, total: parsed.data.rows.length });
  } catch (error) {
    console.error("[ImportStaffTrainings] failed:", error);
    res.status(500).json({ error: String(error) });
  }
}
