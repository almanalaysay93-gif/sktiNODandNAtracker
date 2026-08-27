import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

type SeedData = {
  staff: Array<{ employeeId: string; staffType: string }>;
  trainingCatalog: unknown[];
  events: Array<{
    title: string;
    startDate: string;
    endDate: string;
    provider: string;
    attendees: Array<{ employeeId: string }>;
  }>;
};

const seed = JSON.parse(
  fs.readFileSync(path.resolve("server/data/seedData.json"), "utf8"),
) as SeedData;

const attendance = seed.events.flatMap((event) =>
  event.attendees.map((attendee) => ({ ...event, employeeId: attendee.employeeId })),
);

describe("NN LDI workbook seed", () => {
  it("contains the complete Q1 and Q2 attendance ledger", () => {
    expect(seed.staff).toHaveLength(159);
    expect(seed.trainingCatalog).toHaveLength(293);
    expect(seed.events).toHaveLength(312);
    expect(attendance).toHaveLength(823);
    expect(attendance.filter((row) => row.employeeId.startsWith("RN-"))).toHaveLength(651);
    expect(attendance.filter((row) => row.employeeId.startsWith("NA-"))).toHaveLength(172);
  });

  it("resolves every attendee by stable employee ID", () => {
    const staffIds = new Set(seed.staff.map((person) => person.employeeId));
    expect(new Set(seed.staff.map((person) => person.employeeId)).size).toBe(159);
    expect(attendance.filter((row) => !staffIds.has(row.employeeId))).toEqual([]);
  });

  it("uses valid ISO calendar dates", () => {
    const isValidIsoDate = (value: string) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
      const date = new Date(`${value}T00:00:00Z`);
      return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
    };

    expect(seed.events.filter((event) => !isValidIsoDate(event.startDate) || !isValidIsoDate(event.endDate))).toEqual([]);
  });

  it("preserves the workbook's five exact duplicate attendance rows", () => {
    const keys = attendance.map(
      (row) => `${row.employeeId}\u0000${row.title}\u0000${row.startDate}\u0000${row.endDate}\u0000${row.provider}`,
    );
    expect(keys.length - new Set(keys).size).toBe(5);
  });
});
