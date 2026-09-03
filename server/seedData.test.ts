import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

type SeedData = {
  staff: Array<{
    employeeId: string;
    staffType: string;
    nameInfo: { lastName: string; firstName: string };
  }>;
  trainingCatalog: unknown[];
  events: Array<{
    title: string;
    startDate: string;
    endDate: string;
    provider: string;
    attendees: Array<{
      staffName: string;
      normName?: string;
      role?: string;
      completionDate?: string;
    }>;
  }>;
};

const seed = JSON.parse(
  fs.readFileSync(path.resolve("server/data/seedData.json"), "utf8"),
) as SeedData;

const attendance = seed.events.flatMap((event) =>
  event.attendees.map((attendee) => ({
    ...event,
    staffName: attendee.staffName,
    normName: attendee.normName || attendee.staffName,
    role: attendee.role,
    completionDate: attendee.completionDate,
  })),
);

describe("NN LDI workbook seed", () => {
  it("contains the complete Q1 and Q2 attendance ledger", () => {
    expect(seed.staff).toHaveLength(173);
    expect(seed.trainingCatalog).toHaveLength(294);
    expect(seed.events).toHaveLength(262);
    expect(attendance).toHaveLength(856);
    expect(seed.staff.filter((row) => row.staffType === "Registered Nurse")).toHaveLength(131);
    expect(seed.staff.filter((row) => row.staffType === "Nursing Attendant")).toHaveLength(42);
  });

  it("identifies unique staff and verifies attendee names against staff roster", () => {
    const staffIds = new Set(seed.staff.map((person) => person.employeeId));
    // 171 unique IDs due to the 2 known duplicate PRC license entries in the workbook
    expect(staffIds.size).toBe(171);

    const staffSurnames = new Set(
      seed.staff.map((person) => person.nameInfo.lastName.toUpperCase()),
    );
    // Verified: at least 98% of attendees map directly to staff by surname
    const matchedBySurname = attendance.filter((row) => {
      const surname = row.normName.split(",")[0].trim().toUpperCase();
      return staffSurnames.has(surname);
    });
    expect(matchedBySurname.length).toBeGreaterThan(840);
  });

  it("uses valid ISO calendar dates", () => {
    const isValidIsoDate = (value: string) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
      const date = new Date(`${value}T00:00:00Z`);
      return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
    };

    expect(seed.events.filter((event) => !isValidIsoDate(event.startDate) || !isValidIsoDate(event.endDate))).toEqual([]);
  });

  it("preserves the workbook's duplicate attendance rows", () => {
    const keys = attendance.map(
      (row) => `${row.normName}\u0000${row.title}\u0000${row.startDate}\u0000${row.endDate}\u0000${row.provider}`,
    );
    expect(keys.length - new Set(keys).size).toBe(11);
  });
});
