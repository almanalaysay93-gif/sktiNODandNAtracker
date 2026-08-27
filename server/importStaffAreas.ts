import type { Request, Response } from "express";
import { z } from "zod";
import { sdk } from "./_core/sdk";
import * as db from "./db";

const rowSchema = z.object({ fullName: z.string().min(1).max(256), areaName: z.string().min(1).max(128) });
const bodySchema = z.object({ rows: z.array(rowSchema).max(500) });

// Token-set match: order-independent (handles "LAST, First Middle" vs
// "First Middle Last") and tolerant of punctuation differences between sheets.
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

// Row names are "LAST, First Middle...". Build a first+last-only key (same
// shape as the nurse short key) so a middle-name/initial mismatch between
// sheets doesn't block the match.
function rowShortKey(fullName: string): string {
  const [lastPart, ...restParts] = fullName.split(",");
  if (restParts.length === 0) return normTokenSet(fullName);
  const firstToken = restParts.join(",").trim().split(/\s+/)[0] ?? "";
  return normTokenSet(`${firstToken} ${lastPart}`);
}

function areaCode(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Admin-only bulk area-assignment import: matches names from an HR summary
 * sheet to already-imported nurses (by normalized full name) and sets their
 * current area, creating the area records on first use. Nurses that don't
 * match any name in `rows`, or whose name matches more than one existing
 * nurse, are left untouched and reported back.
 */
export async function importStaffAreasHandler(req: Request, res: Response) {
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

    const areaIdByName = new Map<string, number>();
    for (const a of await db.listAreas()) areaIdByName.set(a.name, a.id);

    let assigned = 0;
    let alreadySet = 0;
    const notFound: string[] = [];
    const ambiguous: string[] = [];

    for (const row of parsed.data.rows) {
      let areaId = areaIdByName.get(row.areaName);
      if (!areaId) {
        areaId = await db.createArea({ code: areaCode(row.areaName), name: row.areaName });
        areaIdByName.set(row.areaName, areaId);
      }

      const fullKey = normTokenSet(row.fullName);
      let candidates = byFullKey.get(fullKey) ?? [];
      if (candidates.length === 0) {
        candidates = byShortKey.get(rowShortKey(row.fullName)) ?? [];
      }
      if (candidates.length === 0) {
        notFound.push(row.fullName);
        continue;
      }
      const uniqueIds = Array.from(new Set(candidates.map((c) => c.id)));
      if (uniqueIds.length > 1) {
        ambiguous.push(row.fullName);
        continue;
      }
      const nurse = candidates[0]!;
      if (nurse.currentAreaId) {
        alreadySet++;
        continue;
      }

      await db.updateNurse(nurse.id, { currentAreaId: areaId });
      await db.createAssignment({
        nurseId: nurse.id,
        areaId,
        startDate: new Date(),
        assignmentType: "Permanent Transfer",
        isCurrent: true,
      });
      assigned++;
    }

    res.json({ ok: true, assigned, alreadySet, notFound, ambiguous, total: parsed.data.rows.length, areas: Array.from(areaIdByName.keys()) });
  } catch (error) {
    console.error("[ImportStaffAreas] failed:", error);
    res.status(500).json({ error: String(error) });
  }
}
