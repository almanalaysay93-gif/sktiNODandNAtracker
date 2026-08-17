import { dateKey } from "../../shared/nursetrack";
import { and, asc, desc, eq, isNull, not, sql } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  areas,
  nurses,
  nurseCredentials,
  nurseTrainings,
  areaAssignments,
  areaTrainingRequirements,
  credentialTypes,
  trainingCatalog,
} from "../../drizzle/schema";
import { daysUntilExpiry, deriveLicenseStatus, durationBetween, todayDate, nurseFullName } from "../../shared/nursetrack";

export type ReportType = "licenseStatus" | "licenseDue" | "trainingCompliance" | "areaExposure" | "trainingSummary" | "transferLog";

export const reportsRouter = router({
  list: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    const today = todayDate();
    const activeNurseCond = and(isNull(nurses.archivedAt), not(eq(nurses.employmentStatus, "Archived")));

    const [activeRow] = await db.select({ count: sql<number>`count(*)` }).from(nurses).where(activeNurseCond);
    const areaCount = (await db.select().from(areas).where(eq(areas.active, true))).length;
    const expiredCount = (await db
      .select({ count: sql<number>`count(*)` })
      .from(nurseCredentials)
      .innerJoin(nurses, eq(nurses.id, nurseCredentials.nurseId))
      .where(isNull(nurses.archivedAt))).length;

    return [
      { type: "licenseStatus" as ReportType, label: "License Status Overview", description: "Active license status of all nurses by area", rowHint: activeRow?.count ?? 0 },
      { type: "licenseDue" as ReportType, label: "Licenses Due for Renewal", description: "Licenses expiring within 1 year, sorted by urgency", rowHint: null },
      { type: "trainingCompliance" as ReportType, label: "Training Compliance by Area", description: "Required-training completion per area", rowHint: areaCount },
      { type: "areaExposure" as ReportType, label: "Area Exposure Report", description: "Per-nurse time spent in each area across all assignments", rowHint: activeRow?.count ?? 0 },
      { type: "trainingSummary" as ReportType, label: "Training Summary", description: "Training counts by category, provider, and status", rowHint: null },
      { type: "transferLog" as ReportType, label: "Transfer Log", description: "Complete history of area transfers, oldest to newest", rowHint: null },
    ];
  }),

  generate: protectedProcedure
    .input(z.object({ type: z.enum(["licenseStatus", "licenseDue", "trainingCompliance", "areaExposure", "trainingSummary", "transferLog"]) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const today = todayDate();

      if (input.type === "licenseStatus") {
        const rows = await db
          .select({
            employeeId: nurses.employeeId,
            firstName: nurses.firstName,
            middleName: nurses.middleName,
            lastName: nurses.lastName,
            currentAreaId: nurses.currentAreaId,
            credentialId: nurseCredentials.id,
            licenseNumber: nurseCredentials.licenseNumber,
            typeName: credentialTypes.name,
            issuingOrganization: nurseCredentials.issuingOrganization,
            issueDate: nurseCredentials.issueDate,
            expiryDate: nurseCredentials.expiryDate,
            renewalStatus: nurseCredentials.renewalStatus,
            verificationStatus: nurseCredentials.verificationStatus,
            archivedAt: nurses.archivedAt,
          })
          .from(nurseCredentials)
          .innerJoin(nurses, eq(nurses.id, nurseCredentials.nurseId))
          .innerJoin(credentialTypes, eq(credentialTypes.id, nurseCredentials.credentialTypeId))
          .orderBy(asc(nurses.lastName), asc(nurses.firstName));
        const areaRows = await db.select().from(areas);
        const areaById = new Map(areaRows.map((a) => [a.id, a]));
        return rows
          .filter((r) => !r.archivedAt)
          .map((r) => ({
            nurse: nurseFullName(r),
            employeeId: r.employeeId,
            areaName: r.currentAreaId ? (areaById.get(r.currentAreaId)?.name ?? "Unknown") : "Unassigned",
            credentialType: r.typeName,
            licenseNumber: r.licenseNumber ?? "—",
            issuingOrganization: r.issuingOrganization ?? "—",
            issueDate: r.issueDate ? String(r.issueDate) : "—",
            expiryDate: dateKey(r.expiryDate),
            daysRemaining: daysUntilExpiry(dateKey(r.expiryDate), today),
            status: deriveLicenseStatus(dateKey(r.expiryDate), today),
            renewalStatus: r.renewalStatus,
            verificationStatus: r.verificationStatus,
          }));
      }

      if (input.type === "licenseDue") {
        const rows = await db
          .select({
            firstName: nurses.firstName, middleName: nurses.middleName, lastName: nurses.lastName,
            employeeId: nurses.employeeId, currentAreaId: nurses.currentAreaId,
            typeName: credentialTypes.name,
            licenseNumber: nurseCredentials.licenseNumber,
            issuingOrganization: nurseCredentials.issuingOrganization,
            expiryDate: nurseCredentials.expiryDate,
            renewalStatus: nurseCredentials.renewalStatus,
            archivedAt: nurses.archivedAt,
          })
          .from(nurseCredentials)
          .innerJoin(nurses, eq(nurses.id, nurseCredentials.nurseId))
          .innerJoin(credentialTypes, eq(credentialTypes.id, nurseCredentials.credentialTypeId))
          .where(sql`DATEDIFF(${nurseCredentials.expiryDate}, CURDATE()) <= 365`)
          .orderBy(sql`DATEDIFF(${nurseCredentials.expiryDate}, CURDATE()) ASC`)
          .limit(300);
        const areaRows = await db.select().from(areas);
        const areaById = new Map(areaRows.map((a) => [a.id, a]));
        return rows
          .filter((r) => !r.archivedAt)
          .map((r) => ({
            nurse: nurseFullName(r),
            employeeId: r.employeeId,
            areaName: r.currentAreaId ? (areaById.get(r.currentAreaId)?.name ?? "Unknown") : "Unassigned",
            credentialType: r.typeName,
            licenseNumber: r.licenseNumber ?? "—",
            issuingOrganization: r.issuingOrganization ?? "—",
            expiryDate: dateKey(r.expiryDate),
            daysRemaining: daysUntilExpiry(dateKey(r.expiryDate), today),
            status: deriveLicenseStatus(dateKey(r.expiryDate), today),
            renewalStatus: r.renewalStatus,
          }));
      }

      if (input.type === "trainingCompliance") {
        const areaRows = await db.select().from(areas);
        const result = [];
        for (const area of areaRows) {
          const requiredIds = await db
            .select({ trainingId: areaTrainingRequirements.trainingId })
            .from(areaTrainingRequirements)
            .where(and(eq(areaTrainingRequirements.areaId, area.id), eq(areaTrainingRequirements.required, true)));
          const required = requiredIds.map((r) => r.trainingId);
          const staff = await db
            .select({ id: nurses.id, firstName: nurses.firstName, middleName: nurses.middleName, lastName: nurses.lastName })
            .from(nurses)
            .where(and(eq(nurses.currentAreaId, area.id), isNull(nurses.archivedAt)));
          let compliant = 0;
          let total = 0;
          for (const n of staff) {
            total += required.length;
            for (const tid of required) {
              const records = await db
                .select({ status: nurseTrainings.status, expiryDate: nurseTrainings.expiryDate })
                .from(nurseTrainings)
                .where(and(eq(nurseTrainings.nurseId, n.id), eq(nurseTrainings.trainingId, tid), eq(nurseTrainings.status, "Completed")));
              if (records.some((r) => !r.expiryDate || new Date(r.expiryDate) > new Date(`${today}T00:00:00`))) compliant++;
            }
          }
          result.push({
            areaName: area.name,
            requiredTrainings: required.length,
            staffCount: staff.length,
            requiredChecks: total,
            compliantChecks: compliant,
            compliancePercent: total > 0 ? Math.round((compliant / total) * 100) : 100,
          });
        }
        return result;
      }

      if (input.type === "areaExposure") {
        const rows = await db
          .select({
            nurseId: nurses.id,
            employeeId: nurses.employeeId,
            firstName: nurses.firstName,
            middleName: nurses.middleName,
            lastName: nurses.lastName,
            areaId: areaAssignments.areaId,
            areaName: areas.name,
            startDate: areaAssignments.startDate,
            endDate: areaAssignments.endDate,
            assignmentType: areaAssignments.assignmentType,
            archivedAt: nurses.archivedAt,
          })
          .from(areaAssignments)
          .innerJoin(nurses, eq(nurses.id, areaAssignments.nurseId))
          .innerJoin(areas, eq(areas.id, areaAssignments.areaId))
          .where(isNull(nurses.archivedAt))
          .orderBy(asc(nurses.lastName), asc(nurses.firstName), asc(areaAssignments.startDate));
        return rows.map((r) => ({
          nurse: nurseFullName(r),
          employeeId: r.employeeId,
          areaName: r.areaName,
          startDate: dateKey(r.startDate),
          endDate: r.endDate ? dateKey(r.endDate) : "Present",
          assignmentType: r.assignmentType ?? "—",
          durationDays: daysBetween(dateKey(r.startDate), r.endDate ? dateKey(r.endDate) : today),
        }));
      }

      if (input.type === "trainingSummary") {
        const rows = await db
          .select({
            trainingName: trainingCatalog.name,
            category: trainingCatalog.category,
            renewalRequired: trainingCatalog.renewalRequired,
            defaultValidityMonths: trainingCatalog.defaultValidityMonths,
            recordId: nurseTrainings.id,
            firstName: nurses.firstName,
            middleName: nurses.middleName,
            lastName: nurses.lastName,
            status: nurseTrainings.status,
            scheduledDate: nurseTrainings.scheduledDate,
            completionDate: nurseTrainings.completionDate,
            expiryDate: nurseTrainings.expiryDate,
            trainingHours: nurseTrainings.trainingHours,
            cpdUnits: nurseTrainings.cpdUnits,
            provider: nurseTrainings.provider,
            archivedAt: nurses.archivedAt,
          })
          .from(nurseTrainings)
          .innerJoin(trainingCatalog, eq(trainingCatalog.id, nurseTrainings.trainingId))
          .innerJoin(nurses, eq(nurses.id, nurseTrainings.nurseId))
          .orderBy(asc(trainingCatalog.name), desc(nurseTrainings.scheduledDate));
        return rows
          .filter((r) => !r.archivedAt)
          .map((r) => ({
            nurse: nurseFullName(r),
            trainingName: r.trainingName,
            category: r.category ?? "—",
            renewalRequired: r.renewalRequired,
            defaultValidityMonths: r.defaultValidityMonths ?? null,
            status: r.status,
            scheduledDate: r.scheduledDate ? dateKey(r.scheduledDate) : "—",
            completionDate: r.completionDate ? dateKey(r.completionDate) : "—",
            expiryDate: r.expiryDate ? dateKey(r.expiryDate) : "—",
            trainingHours: r.trainingHours ?? null,
            cpdUnits: r.cpdUnits ?? null,
            provider: r.provider ?? "—",
          }));
      }

      // transferLog
      const rows = await db
        .select({
          nurseId: nurses.id,
          employeeId: nurses.employeeId,
          firstName: nurses.firstName,
          middleName: nurses.middleName,
          lastName: nurses.lastName,
          areaName: areas.name,
          startDate: areaAssignments.startDate,
          endDate: areaAssignments.endDate,
          assignmentType: areaAssignments.assignmentType,
          remarks: areaAssignments.remarks,
          archivedAt: nurses.archivedAt,
        })
        .from(areaAssignments)
        .innerJoin(nurses, eq(nurses.id, areaAssignments.nurseId))
        .innerJoin(areas, eq(areas.id, areaAssignments.areaId))
        .orderBy(asc(areaAssignments.startDate), asc(nurses.lastName));
      return rows.map((r) => ({
        nurse: nurseFullName(r),
        employeeId: r.employeeId,
        areaName: r.areaName,
        startDate: dateKey(r.startDate),
        endDate: r.endDate ? dateKey(r.endDate) : "Present",
        assignmentType: r.assignmentType ?? "—",
        remarks: r.remarks ?? "—",
      }));
    }),
});

function daysBetween(start: string | Date, end: string | Date, today = todayDate()): number {
  const s = new Date(`${String(start)}T00:00:00`).getTime();
  const e = end === "Present" || !end ? new Date(`${today}T00:00:00`).getTime() : new Date(`${String(end)}T00:00:00`).getTime();
  return e >= s ? Math.floor((e - s) / 86400000) : 0;
}

