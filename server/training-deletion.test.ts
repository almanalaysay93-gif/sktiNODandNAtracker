import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  deleteNurseTraining: vi.fn(),
  getNurseTrainingById: vi.fn(),
  deleteTrainingEvent: vi.fn(),
  deleteTrainingCatalogItem: vi.fn(),
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

  it("deletes a training/seminar catalog item and writes an audit entry", async () => {
    dbMocks.deleteTrainingCatalogItem.mockResolvedValue({
      catalog: { id: 15, name: "Peritoneal Dialysis 101", kind: "Seminar" },
      eventsDeleted: 2,
      attendanceDeleted: 6,
    });
    const caller = trainingsRouter.createCaller(adminContext()) as any;

    await expect(caller.deleteCatalogItem({ id: 15 })).resolves.toEqual({
      success: true,
      eventsDeleted: 2,
      attendanceDeleted: 6,
    });
    expect(dbMocks.deleteTrainingCatalogItem).toHaveBeenCalledWith(15);
    expect(dbMocks.logActivity).toHaveBeenCalledWith(expect.objectContaining({
      supervisorId: 9,
      actionType: "training.catalog.deleted",
      entityType: "trainingCatalog",
      entityId: 15,
    }));
  });

  it("rejects an unknown catalog item", async () => {
    dbMocks.deleteTrainingCatalogItem.mockResolvedValue(null);
    const caller = trainingsRouter.createCaller(adminContext()) as any;

    await expect(caller.deleteCatalogItem({ id: 404 })).rejects.toMatchObject<Partial<TRPCError>>({ code: "NOT_FOUND" });
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

  it("removes an attendance record from a seminar and writes an audit entry", async () => {
    dbMocks.getNurseTrainingById.mockResolvedValue({ id: 105, nurseId: 8, eventId: 23 });
    dbMocks.deleteNurseTraining.mockResolvedValue({ id: 105, nurseId: 8, eventId: 23 });
    const caller = seminarsRouter.createCaller(adminContext()) as any;

    await expect(caller.removeAttendance({ attendanceId: 105 })).resolves.toEqual({ success: true });
    expect(dbMocks.deleteNurseTraining).toHaveBeenCalledWith(105);
    expect(dbMocks.logActivity).toHaveBeenCalledWith(expect.objectContaining({
      supervisorId: 9,
      nurseId: 8,
      actionType: "seminar.attendance.deleted",
      entityType: "nurseTraining",
      entityId: 105,
    }));
  });

  it("refuses to remove a training-log record that is not seminar attendance", async () => {
    dbMocks.getNurseTrainingById.mockResolvedValue({ id: 106, nurseId: 8, eventId: null });
    const caller = seminarsRouter.createCaller(adminContext()) as any;

    await expect(caller.removeAttendance({ attendanceId: 106 })).rejects.toMatchObject<Partial<TRPCError>>({ code: "BAD_REQUEST" });
    expect(dbMocks.deleteNurseTraining).not.toHaveBeenCalled();
    expect(dbMocks.logActivity).not.toHaveBeenCalled();
  });

  it("rejects an unknown attendance record", async () => {
    dbMocks.getNurseTrainingById.mockResolvedValue(null);
    const caller = seminarsRouter.createCaller(adminContext()) as any;

    await expect(caller.removeAttendance({ attendanceId: 404 })).rejects.toMatchObject<Partial<TRPCError>>({ code: "NOT_FOUND" });
    expect(dbMocks.deleteNurseTraining).not.toHaveBeenCalled();
  });
});
