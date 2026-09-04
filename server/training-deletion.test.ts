import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  deleteNurseTraining: vi.fn(),
  deleteTrainingEvent: vi.fn(),
  logActivity: vi.fn(),
  getDb: vi.fn(),
}));

vi.mock("./db", () => dbMocks);

import { seminarsRouter } from "./routers/seminars";
import { trainingsRouter } from "./routers/trainings";

function adminContext() {
  return {
    user: {
      id: 9,
      openId: "delete-test-admin",
      email: "admin@example.com",
      name: "Delete Test Admin",
      loginMethod: "google",
      role: "admin" as const,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} },
    res: { clearCookie: () => undefined },
  } as any;
}

describe("training deletion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes one training record and writes an audit entry", async () => {
    dbMocks.deleteNurseTraining.mockResolvedValue({ id: 42, nurseId: 7, trainingId: 11 });
    const caller = trainingsRouter.createCaller(adminContext()) as any;

    await expect(caller.deleteRecord({ id: 42 })).resolves.toEqual({ success: true });
    expect(dbMocks.deleteNurseTraining).toHaveBeenCalledWith(42);
    expect(dbMocks.logActivity).toHaveBeenCalledWith(expect.objectContaining({
      supervisorId: 9,
      nurseId: 7,
      actionType: "training.deleted",
      entityType: "nurseTraining",
      entityId: 42,
    }));
  });

  it("rejects an unknown training record", async () => {
    dbMocks.deleteNurseTraining.mockResolvedValue(null);
    const caller = trainingsRouter.createCaller(adminContext()) as any;

    await expect(caller.deleteRecord({ id: 404 })).rejects.toMatchObject<Partial<TRPCError>>({ code: "NOT_FOUND" });
    expect(dbMocks.logActivity).not.toHaveBeenCalled();
  });
});

describe("seminar deletion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes one seminar and its linked attendance records", async () => {
    dbMocks.deleteTrainingEvent.mockResolvedValue({
      event: { id: 23, trainingId: 11, startDate: new Date("2026-09-10T00:00:00Z") },
      training: { id: 11, name: "Dialysis Safety", kind: "Seminar" },
      attendanceDeleted: 3,
    });
    const caller = seminarsRouter.createCaller(adminContext()) as any;

    await expect(caller.deleteEvent({ eventId: 23 })).resolves.toEqual({ success: true, attendanceDeleted: 3 });
    expect(dbMocks.deleteTrainingEvent).toHaveBeenCalledWith(23);
    expect(dbMocks.logActivity).toHaveBeenCalledWith(expect.objectContaining({
      supervisorId: 9,
      actionType: "seminar.deleted",
      entityType: "trainingEvent",
      entityId: 23,
    }));
  });

  it("rejects an unknown seminar", async () => {
    dbMocks.deleteTrainingEvent.mockResolvedValue(null);
    const caller = seminarsRouter.createCaller(adminContext()) as any;

    await expect(caller.deleteEvent({ eventId: 404 })).rejects.toMatchObject<Partial<TRPCError>>({ code: "NOT_FOUND" });
    expect(dbMocks.logActivity).not.toHaveBeenCalled();
  });
});
