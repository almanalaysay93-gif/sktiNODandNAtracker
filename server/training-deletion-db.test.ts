import Database from "better-sqlite3";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const localState = vi.hoisted(() => ({ sqlite: null as Database.Database | null }));

vi.mock("./localDb", () => ({
  getSqliteDb: () => {
    if (!localState.sqlite) throw new Error("Test database is not ready.");
    return localState.sqlite;
  },
}));

import { deleteNurseTraining, deleteTrainingEvent } from "./db";

beforeAll(() => {
  vi.stubEnv("DATABASE_URL", "");
  localState.sqlite = new Database(":memory:");
  localState.sqlite.exec(`
    CREATE TABLE trainingCatalog (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      kind TEXT NOT NULL
    );
    CREATE TABLE trainingEvents (
      id INTEGER PRIMARY KEY,
      trainingId INTEGER NOT NULL,
      startDate TEXT NOT NULL
    );
    CREATE TABLE nurseTrainings (
      id INTEGER PRIMARY KEY,
      nurseId INTEGER NOT NULL,
      trainingId INTEGER NOT NULL,
      eventId INTEGER,
      status TEXT NOT NULL
    );
  `);
});

beforeEach(() => {
  localState.sqlite!.exec("DELETE FROM nurseTrainings; DELETE FROM trainingEvents; DELETE FROM trainingCatalog;");
  localState.sqlite!.prepare("INSERT INTO trainingCatalog (id, name, kind) VALUES (1, 'Dialysis Safety', 'Seminar')").run();
  localState.sqlite!.prepare("INSERT INTO trainingEvents (id, trainingId, startDate) VALUES (10, 1, '2026-09-10'), (11, 1, '2026-10-10')").run();
  localState.sqlite!.prepare("INSERT INTO nurseTrainings (id, nurseId, trainingId, eventId, status) VALUES (100, 1, 1, 10, 'Completed'), (101, 2, 1, 11, 'Completed'), (102, 3, 1, NULL, 'Completed')").run();
});

afterAll(() => {
  localState.sqlite?.close();
  localState.sqlite = null;
  vi.unstubAllEnvs();
});

describe("training deletion database operations", () => {
  it("deletes only the selected training record", async () => {
    await expect(deleteNurseTraining(100)).resolves.toMatchObject({ id: 100, nurseId: 1 });

    const recordIds = localState.sqlite!.prepare("SELECT id FROM nurseTrainings ORDER BY id").all() as { id: number }[];
    expect(recordIds.map((row) => row.id)).toEqual([101, 102]);
    expect(localState.sqlite!.prepare("SELECT COUNT(*) AS count FROM trainingEvents").get()).toEqual({ count: 2 });
    expect(localState.sqlite!.prepare("SELECT COUNT(*) AS count FROM trainingCatalog").get()).toEqual({ count: 1 });
  });

  it("deletes one seminar and only its linked attendance", async () => {
    await expect(deleteTrainingEvent(10)).resolves.toMatchObject({
      event: { id: 10, trainingId: 1 },
      training: { id: 1, name: "Dialysis Safety", kind: "Seminar" },
      attendanceDeleted: 1,
    });

    const eventIds = localState.sqlite!.prepare("SELECT id FROM trainingEvents ORDER BY id").all() as { id: number }[];
    const recordIds = localState.sqlite!.prepare("SELECT id FROM nurseTrainings ORDER BY id").all() as { id: number }[];
    expect(eventIds.map((row) => row.id)).toEqual([11]);
    expect(recordIds.map((row) => row.id)).toEqual([101, 102]);
    expect(localState.sqlite!.prepare("SELECT COUNT(*) AS count FROM trainingCatalog").get()).toEqual({ count: 1 });
  });

  it("returns null when the target does not exist", async () => {
    await expect(deleteNurseTraining(999)).resolves.toBeNull();
    await expect(deleteTrainingEvent(999)).resolves.toBeNull();
  });
});
