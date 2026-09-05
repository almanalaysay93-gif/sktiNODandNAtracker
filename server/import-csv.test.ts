import fs from "fs";
import path from "path";
import os from "os";
import Database from "better-sqlite3";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const localState = vi.hoisted(() => ({ sqlite: null as Database.Database | null }));

vi.mock("./localDb", () => ({
  getSqliteDb: () => {
    if (!localState.sqlite) throw new Error("Test database is not ready.");
    return localState.sqlite;
  },
}));

import { importFromCsvOutputs, parseCsv } from "./scripts/importCsv";

describe("importFromCsvOutputs", () => {
  let tempDir: string;
  let nursesDir: string;
  let trainingsDir: string;

  beforeAll(() => {
    vi.stubEnv("DATABASE_URL", "");
    localState.sqlite = new Database(":memory:");
    localState.sqlite.exec(`
      CREATE TABLE areas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL UNIQUE,
        description TEXT,
        sortOrder INTEGER DEFAULT 0,
        active INTEGER DEFAULT 1,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
        updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE nurses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        employeeId TEXT NOT NULL UNIQUE,
        firstName TEXT NOT NULL,
        middleName TEXT,
        lastName TEXT NOT NULL,
        suffix TEXT,
        position TEXT NOT NULL,
        contactNumber TEXT,
        email TEXT,
        staffType TEXT DEFAULT 'Registered Nurse',
        dateHired TEXT,
        employmentStatus TEXT DEFAULT 'Active',
        currentAreaId INTEGER,
        profilePhotoKey TEXT,
        accountEmail TEXT,
        linkedUserId INTEGER,
        archivedAt TEXT,
        notes TEXT,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
        updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE areaAssignments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nurseId INTEGER NOT NULL,
        areaId INTEGER NOT NULL,
        startDate TEXT NOT NULL,
        endDate TEXT,
        assignmentType TEXT DEFAULT 'Primary',
        remarks TEXT,
        isCurrent INTEGER DEFAULT 1,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
        updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE trainingCatalog (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        category TEXT,
        kind TEXT NOT NULL,
        renewalRequired INTEGER DEFAULT 0,
        defaultValidityMonths INTEGER,
        active INTEGER DEFAULT 1,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
        updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE nurseTrainings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nurseId INTEGER NOT NULL,
        trainingId INTEGER NOT NULL,
        eventId INTEGER,
        participationRole TEXT DEFAULT 'Participant',
        provider TEXT,
        status TEXT NOT NULL,
        scheduledDate TEXT,
        completionDate TEXT NOT NULL,
        expiryDate TEXT,
        trainingHours REAL,
        cpdUnits REAL,
        certificateNumber TEXT,
        certificateKey TEXT,
        remarks TEXT,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
        updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE activityLog (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        supervisorId INTEGER,
        nurseId INTEGER,
        actionType TEXT NOT NULL,
        entityType TEXT,
        entityId INTEGER,
        summary TEXT,
        metadata TEXT,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);
  });

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nursetrack-csv-test-"));
    nursesDir = path.join(tempDir, "nurses");
    trainingsDir = path.join(tempDir, "trainings");
    fs.mkdirSync(nursesDir, { recursive: true });
    fs.mkdirSync(trainingsDir, { recursive: true });

    localState.sqlite!.exec("DELETE FROM activityLog; DELETE FROM nurseTrainings; DELETE FROM trainingCatalog; DELETE FROM areaAssignments; DELETE FROM nurses; DELETE FROM areas;");
  });

  afterAll(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    localState.sqlite?.close();
    localState.sqlite = null;
    vi.unstubAllEnvs();
  });

  it("imports nurses and training records from CSV directories with foreign key resolution", async () => {
    // 1. Write sample nurses CSV
    const nurseCsvContent = [
      "employee_id,first_name,middle_name,last_name,suffix,position,staff_type,area_name,date_hired,employment_status,contact_number",
      "RN-500,JUAN,M.,DELA CRUZ,,Staff Nurse II,Registered Nurse,Intensive Care Unit,2021-01-10,Active,09171234567",
      "NA-600,MARIA,,SANTOS,,Nursing Attendant I,Nursing Attendant,Emergency Room,2022-03-01,Active,09187654321",
    ].join("\n");
    fs.writeFileSync(path.join(nursesDir, "roster_nurses.csv"), nurseCsvContent, "utf-8");

    // 2. Write sample trainings CSV
    const trainingCsvContent = [
      "training_name,employee_id,nurse_name,participation_role,provider,status,completion_date,training_hours,cpd_units,certificate_number,remarks",
      "Basic Life Support,RN-500,Juan Dela Cruz,Participant,AHA,Completed,2026-04-10,8.0,4.0,BLS-2026-001,Annual Renewal",
    ].join("\n");
    fs.writeFileSync(path.join(trainingsDir, "training_logs.csv"), trainingCsvContent, "utf-8");

    // 3. Run import
    const result = await importFromCsvOutputs(tempDir);

    expect(result.errors).toEqual([]);
    expect(result.nursesCreated).toBe(2);
    expect(result.trainingsCreated).toBe(1);

    // Verify nurses in DB
    const dbNurses = localState.sqlite!.prepare("SELECT * FROM nurses ORDER BY employeeId ASC").all() as any[];
    expect(dbNurses).toHaveLength(2);
    expect(dbNurses[0].employeeId).toBe("NA-600");
    expect(dbNurses[0].staffType).toBe("Nursing Attendant");
    expect(dbNurses[1].employeeId).toBe("RN-500");
    expect(dbNurses[1].firstName).toBe("JUAN");
    expect(dbNurses[1].lastName).toBe("DELA CRUZ");

    // Verify areas created
    const dbAreas = localState.sqlite!.prepare("SELECT * FROM areas ORDER BY name ASC").all() as any[];
    expect(dbAreas).toHaveLength(2);
    expect(dbAreas.map(a => a.name)).toEqual(["Emergency Room", "Intensive Care Unit"]);

    // Verify training catalog and records
    const dbCatalog = localState.sqlite!.prepare("SELECT * FROM trainingCatalog WHERE name = 'Basic Life Support'").get() as any;
    expect(dbCatalog).toBeDefined();
    expect(dbCatalog.name).toBe("Basic Life Support");

    const dbTrainings = localState.sqlite!.prepare("SELECT * FROM nurseTrainings").all() as any[];
    expect(dbTrainings).toHaveLength(1);
    expect(dbTrainings[0].nurseId).toBe(dbNurses[1].id);
    expect(dbTrainings[0].trainingId).toBe(dbCatalog.id);
    expect(dbTrainings[0].trainingHours).toBe(8.0);
    expect(dbTrainings[0].cpdUnits).toBe(4.0);
  });

  it("does not duplicate records when the same CSVs are imported twice", async () => {
    fs.writeFileSync(path.join(nursesDir, "roster_nurses.csv"), [
      "employee_id,first_name,last_name,position,staff_type,area_name,date_hired,employment_status",
      "RN-500,JUAN,DELA CRUZ,Staff Nurse II,Registered Nurse,Intensive Care Unit,2021-01-10,Active",
    ].join("\n"), "utf-8");
    fs.writeFileSync(path.join(trainingsDir, "training_logs.csv"), [
      "training_name,employee_id,nurse_name,participation_role,provider,status,completion_date",
      "Basic Life Support,RN-500,Juan Dela Cruz,Participant,AHA,Completed,2026-04-10",
    ].join("\n"), "utf-8");

    const first = await importFromCsvOutputs(tempDir);
    expect(first.trainingsCreated).toBe(1);

    const second = await importFromCsvOutputs(tempDir);
    expect(second.errors).toEqual([]);
    expect(second.nursesCreated).toBe(0);
    expect(second.nursesUpdated).toBe(1);
    expect(second.trainingsCreated).toBe(0);
    expect(second.trainingsSkipped).toBe(1);

    const dbTrainings = localState.sqlite!.prepare("SELECT * FROM nurseTrainings").all() as any[];
    expect(dbTrainings).toHaveLength(1);
  });

  it("parses quoted fields containing commas and newlines", () => {
    const csv = [
      "training_name,remarks",
      '"Basic, Advanced","line one' + "\n" + 'line two"',
      "",
    ].join("\n");
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0]["training_name"]).toBe("Basic, Advanced");
    expect(rows[0]["remarks"]).toBe("line one\nline two");
  });
});
