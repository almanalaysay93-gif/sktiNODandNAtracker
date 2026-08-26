import type { Request, Response } from "express";
import { z } from "zod";
import { sdk } from "./_core/sdk";
import * as db from "./db";

const rowSchema = z.object({ fullName: z.string().min(1).max(256), areaName: z.string().min(1).max(128) });
const bodySchema = z.object({ rows: z.array(rowSchema).max(500) });

const normalizeForMatch = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

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
    const byNormName = new Map<string, typeof nurses>();
    for (const n of nurses) {
      const full = normalizeForMatch(`${n.firstName} ${n.middleName ?? ""} ${n.lastName} ${n.suffix ?? ""}`);
      const short = normalizeForMatch(`${n.firstName} ${n.lastName}`);
      for (const key of [full, short]) {
        if (!byNormName.has(key)) byNormName.set(key, []);
        byNormName.get(key)!.push(n);
      }
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

      const key = normalizeForMatch(row.fullName);
      const candidates = byNormName.get(key) ?? [];
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
