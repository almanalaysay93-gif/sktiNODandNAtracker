import type { Request, Response } from "express";
import { z } from "zod";
import { sdk } from "./_core/sdk";
import { bulkSetAccountEmailsByLicense } from "./db";

const bodySchema = z.object({
  rows: z.array(z.object({ licenseNumber: z.string(), email: z.string() })).max(2000),
});

/**
 * Admin-only bulk import: pre-fill nurses.accountEmail from an HR
 * spreadsheet, matched by license/PRC number. Staff still only get linked
 * to their Google account on actual sign-in (see autoLinkNurseByEmail) —
 * this just saves them from having to type PRC number + name themselves.
 */
export async function importStaffEmailsHandler(req: Request, res: Response) {
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
    const result = await bulkSetAccountEmailsByLicense(parsed.data.rows);
    res.json({ ok: true, ...result, total: parsed.data.rows.length });
  } catch (error) {
    console.error("[ImportStaffEmails] failed:", error);
    res.status(500).json({ error: String(error) });
  }
}
