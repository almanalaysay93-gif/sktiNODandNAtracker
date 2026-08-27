import type { Request, Response } from "express";
import { z } from "zod";
import { sdk } from "./_core/sdk";
import * as db from "./db";
import { renewalCycleKey } from "../shared/nursetrack";
import { CANONICAL_CREDENTIAL_TYPES } from "./deduplicate";

const rowSchema = z.object({
  firstName: z.string().min(1).max(128),
  middleName: z.string().max(128).optional(),
  lastName: z.string().min(1).max(128),
  staffType: z.enum(["Registered Nurse", "Nursing Attendant"]),
  licenseNumber: z.string().min(1).max(64),
  expiryDate: z.string(),
  email: z.string().email(),
});

const bodySchema = z.object({ rows: z.array(rowSchema).max(500) });

const CREDENTIAL_TYPE_BY_STAFF_TYPE: Record<string, string> = {
  "Registered Nurse": CANONICAL_CREDENTIAL_TYPES.RN,
  "Nursing Attendant": CANONICAL_CREDENTIAL_TYPES.NA,
};

/**
 * Admin-only bulk roster import: creates nurse profiles + their license
 * credential from an HR spreadsheet, pre-filling accountEmail so each
 * person auto-links to their profile on first Google sign-in. Idempotent
 * on employeeId (= licenseNumber): re-running skips nurses that already
 * exist rather than erroring the whole batch.
 */
export async function importStaffRosterHandler(req: Request, res: Response) {
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

    const typeIdByName = new Map<string, number>();
    for (const t of await db.listCredentialTypes()) typeIdByName.set(t.name, t.id);

    const allExistingNurses = await db.listNurses();
    const nurseByName = new Map(
      allExistingNurses.map((n) => [`${n.lastName.trim()} ${n.firstName.trim()}`.toLowerCase().replace(/[^a-z0-9]/g, ""), n])
    );

    let created = 0;
    let skipped = 0;
    const errors: Array<{ licenseNumber: string; error: string }> = [];

    for (const row of parsed.data.rows) {
      try {
        const nameKey = `${row.lastName.trim()} ${row.firstName.trim()}`.toLowerCase().replace(/[^a-z0-9]/g, "");
        const existing = (await db.getNurseByEmployeeId(row.licenseNumber)) ?? nurseByName.get(nameKey);
        
        if (existing) {
          // Nurse already exists: update email and ensure license without creating duplicate nurse
          if (!existing.accountEmail && row.email) {
            await db.updateNurse(existing.id, { accountEmail: row.email });
          }
          skipped++;
          continue;
        }

        const typeName = CREDENTIAL_TYPE_BY_STAFF_TYPE[row.staffType];
        let credentialTypeId = typeIdByName.get(typeName);
        if (!credentialTypeId) {
          credentialTypeId = await db.createCredentialType(typeName);
          typeIdByName.set(typeName, credentialTypeId);
        }

        const nurseId = await db.createNurse({
          employeeId: row.licenseNumber,
          firstName: row.firstName,
          middleName: row.middleName ?? null,
          lastName: row.lastName,
          staffType: row.staffType,
          employmentStatus: "Active",
          accountEmail: row.email,
        } as Parameters<typeof db.createNurse>[0]);

        await db.createCredential({
          nurseId,
          credentialTypeId,
          licenseNumber: row.licenseNumber,
          expiryDate: row.expiryDate,
          renewalCycleKey: renewalCycleKey(`import-${nurseId}`),
        });

        created++;
      } catch (rowError) {
        errors.push({ licenseNumber: row.licenseNumber, error: String(rowError) });
      }
    }

    res.json({ ok: true, created, skipped, errors, total: parsed.data.rows.length });
  } catch (error) {
    console.error("[ImportStaffRoster] failed:", error);
    res.status(500).json({ error: String(error) });
  }
}
