import { z } from "zod";
import { adminProcedure, router } from "../_core/trpc";
import * as db from "../db";
import { deriveLicenseStatus, daysUntilExpiry, todayDate, parseLocalDate, dateKey } from "../../shared/nursetrack";

function dateIso(d: Date | string | null | undefined): string {
  if (!d) return "";
  return parseLocalDate(d).toLocaleDateString("en-CA");
}

const nullableDateInput = z.union([z.date(), z.string().datetime(), z.null()]).transform((d) => (d === null ? null : d instanceof Date ? d : new Date(d))).optional();

export const calendarRouter = router({
  listEvents: adminProcedure
    .input(
      z.object({
        from: z.date().optional(),
        to: z.date().optional(),
        includeTypes: z.array(z.enum(["license", "training", "areaChange", "custom"])).optional(),
      }),
    )
    .query(async ({ input }) => {
      const from = input.from ?? new Date("2020-01-01");
      const to = input.to ?? new Date(Date.now() + 365 * 86400000);
      const includeTypes = new Set(input.includeTypes ?? ["license", "training", "areaChange", "custom"]);
      const today = todayDate();

      const events: {
        id: string;
        type: "license" | "training" | "areaChange" | "custom";
        subtype: string;
        title: string;
        date: string;
        startTime?: string | null;
        endTime?: string | null;
        allDay: boolean;
        severity: string;
        nurseId?: number | null;
        nurseName?: string | null;
        areaId?: number | null;
        areaName?: string | null;
        relatedEntityType?: string | null;
        relatedEntityId?: number | null;
        description?: string | null;
      }[] = [];

      const nurses = await db.listNurses({ archived: false });
      const nurseById = new Map(nurses.map((n) => [n.id, n]));
      const areaRows = await db.listAreas();
      const areaById = new Map(areaRows.map((a) => [a.id, a]));

      const inRange = (d: string) => d >= from.toISOString().slice(0, 10) && d <= to.toISOString().slice(0, 10);
      // License milestone events (1-year, 6-month, expiry) for non-archived nurses.
      if (includeTypes.has("license")) {
        const creds = await db.listCredentials();
        for (const c of creds) {
          const nurse = nurseById.get(c.nurseId);
          if (!nurse || nurse.archivedAt) continue;
          const expiryStr = dateIso(c.expiryDate);
          const days = daysUntilExpiry(expiryStr, today);
          if (days < 0) {
            if (inRange(expiryStr)) {
              events.push({
                id: `lic-${c.id}`, type: "license", subtype: "expired",
                title: `License expired — ${nurse.firstName} ${nurse.lastName}`,
                date: expiryStr, allDay: true, severity: "urgent_or_expired",
                nurseId: nurse.id, nurseName: `${nurse.firstName} ${nurse.lastName}`,
                areaId: nurse.currentAreaId ?? undefined,
                areaName: nurse.currentAreaId ? areaById.get(nurse.currentAreaId)?.name : null,
                relatedEntityType: "credential", relatedEntityId: c.id,
              });
            }
          } else {
            for (const threshold of [365, 180]) {
              if (days <= threshold) {
                const label = threshold === 365 ? "1-year renewal" : "6-month renewal";
                if (inRange(expiryStr)) {
                  events.push({
                    id: `lic-${threshold}-${c.id}`, type: "license", subtype: threshold === 365 ? "reminder1y" : "reminder6m",
                    title: `${label} reminder — ${nurse.firstName} ${nurse.lastName}`,
                    date: expiryStr, allDay: true, severity: threshold === 365 ? "attention" : "upcoming_renewal",
                    nurseId: nurse.id, nurseName: `${nurse.firstName} ${nurse.lastName}`,
                    areaId: nurse.currentAreaId ?? undefined,
                    areaName: nurse.currentAreaId ? areaById.get(nurse.currentAreaId)?.name : null,
                    relatedEntityType: "credential", relatedEntityId: c.id,
                  });
                }
              }
            }
          }
        }
      }

      // Training schedule & expiry events.
      if (includeTypes.has("training")) {
        const records = await db.listNurseTrainings();
        for (const r of records) {
          const nurse = nurseById.get(r.nurseId);
          if (!nurse || nurse.archivedAt) continue;
          if (r.status === "Cancelled") continue;
          if (r.scheduledDate && inRange(dateIso(r.scheduledDate))) {
            events.push({
              id: `trn-${r.id}`, type: "training", subtype: "schedule",
              title: `Training: ${r.status === "Scheduled" ? "scheduled" : r.status} — ${nurse.firstName} ${nurse.lastName}`,
              date: dateIso(r.scheduledDate), allDay: true,
              severity: r.status === "Scheduled" ? "informational" : r.status === "Completed" ? "healthy" : "attention",
              nurseId: nurse.id, nurseName: `${nurse.firstName} ${nurse.lastName}`,
              areaId: nurse.currentAreaId ?? undefined,
              areaName: nurse.currentAreaId ? areaById.get(nurse.currentAreaId)?.name : null,
              relatedEntityType: "nurseTraining", relatedEntityId: r.id,
            });
          }
          if (r.status === "Completed" && r.expiryDate && inRange(dateIso(r.expiryDate))) {
            const days = daysUntilExpiry(dateIso(r.expiryDate), today);
            events.push({
              id: `trne-${r.id}`, type: "training", subtype: "expiry",
              title: `Training expires — ${nurse.firstName} ${nurse.lastName}${days <= 0 ? " (expired)" : ""}`,
              date: dateIso(r.expiryDate), allDay: true,
              severity: days <= 0 ? "urgent_or_expired" : days <= 180 ? "upcoming_renewal" : "attention",
              nurseId: nurse.id, nurseName: `${nurse.firstName} ${nurse.lastName}`,
              areaId: nurse.currentAreaId ?? undefined,
              areaName: nurse.currentAreaId ? areaById.get(nurse.currentAreaId)?.name : null,
              relatedEntityType: "nurseTraining", relatedEntityId: r.id,
            });
          }
        }
      }

      // Area assignment change events (current + upcoming non-current).
      if (includeTypes.has("areaChange")) {
        const allNurses = await db.listNurses();
        for (const n of allNurses) {
          if (n.archivedAt) continue;
          const assignments = await db.listAssignmentsForNurse(n.id);
          for (const a of assignments) {
            if (a.endDate) continue; // closed assignments don't appear as events
            const startStr = dateKey(a.startDate);
            if (inRange(startStr)) {
              const newArea = areaById.get(a.areaId);
              const isFuture = startStr > today;
              events.push({
                id: `asgn-${a.id}`, type: "areaChange", subtype: isFuture ? "transfer-upcoming" : "transfer",
                title: `${a.isCurrent ? "Current area" : "Area change"} — ${n.firstName} ${n.lastName}${newArea ? ` → ${newArea.name}` : ""}`,
                date: startStr, allDay: true,
                severity: isFuture ? "informational" : "neutral",
                nurseId: n.id, nurseName: `${n.firstName} ${n.lastName}`,
                areaId: a.areaId, areaName: newArea?.name ?? null,
                relatedEntityType: "areaAssignment", relatedEntityId: a.id,
                description: a.assignmentType ?? undefined,
              });
            }
          }
        }
      }

      // Custom events.
      if (includeTypes.has("custom")) {
        const customs = await db.listCustomEvents({ from, to });
        for (const c of customs) {
          const nurse = c.nurseId ? nurseById.get(c.nurseId) : undefined;
          events.push({
            id: `cce-${c.id}`, type: "custom", subtype: "custom",
            title: c.title,
            date: dateKey(c.eventDate),
            startTime: c.startTime,
            endTime: c.endTime,
            allDay: c.allDay,
            severity: "informational",
            nurseId: c.nurseId ?? undefined,
            nurseName: nurse ? `${nurse.firstName} ${nurse.lastName}` : null,
            areaId: c.areaId ?? undefined,
            areaName: c.areaId ? areaById.get(c.areaId)?.name ?? null : null,
            description: c.description ?? undefined,
            relatedEntityType: "customCalendarEvent", relatedEntityId: c.id,
          });
        }
      }

      events.sort((a, b) => a.date.localeCompare(b.date));
      return events;
    }),

  createCustomEvent: adminProcedure
    .input(
      z.object({
        title: z.string().min(1).max(256),
        eventDate: z.date(),
        startTime: z.string().max(8).optional(),
        endTime: z.string().max(8).optional(),
        allDay: z.boolean().optional(),
        nurseId: z.number().optional(),
        areaId: z.number().optional(),
        description: z.string().max(5000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const id = await db.createCustomEvent({
        ...input,
        startTime: input.startTime ?? null,
        endTime: input.endTime ?? null,
        allDay: input.allDay ?? true,
        nurseId: input.nurseId ?? null,
        areaId: input.areaId ?? null,
      });
      return { id };
    }),

  updateCustomEvent: adminProcedure
    .input(
      z.object({
        id: z.number(),
        title: z.string().min(1).max(256).optional(),
        eventDate: z.date().optional(),
        startTime: z.string().max(8).optional(),
        endTime: z.string().max(8).optional(),
        allDay: z.boolean().optional(),
        nurseId: z.number().optional(),
        areaId: z.number().optional(),
        description: z.string().max(5000).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const { id, ...rest } = input;
      await db.updateCustomEvent(id, { ...rest });
      return { success: true } as const;
    }),

  deleteCustomEvent: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.deleteCustomEvent(input.id);
      return { success: true } as const;
    }),
});
