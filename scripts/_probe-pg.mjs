import "dotenv/config";

const db = await import("../server/db.ts");
const sql = (await import("drizzle-orm")).sql;

const handle = await db.getDb();
if (!handle) {
  console.log("no DATABASE_URL — nothing to test");
  process.exit(1);
}

const stamp = `ZZTEST-${Date.now()}`;
const nurseId = await db.createNurse({
  employeeId: stamp,
  firstName: "Delete",
  lastName: "Probe",
  staffType: "Registered Nurse",
  employmentStatus: "Active",
});
console.log("created nurse   :", nurseId);

const credTypes = await db.listCredentialTypes(true);
const credId = await db.createCredential({
  nurseId,
  credentialTypeId: credTypes[0].id,
  expiryDate: "2030-01-01",
  renewalCycleKey: stamp,
});
const trainings = await db.listTrainingTypes(true);
const trainingId = await db.createNurseTraining({
  nurseId,
  trainingId: trainings[0].id,
  status: "Completed",
  completionDate: "2025-01-01",
});
const assignmentId = await db.createAssignment({
  nurseId,
  areaId: (await db.listAreas(true))[0].id,
  startDate: "2025-01-01",
  isCurrent: true,
});
const logId = await db.recordEmailLog({
  nurseId,
  recipientEmail: "probe@example.com",
  emailType: "license_expiry",
  subject: "probe",
  status: "mock_sent",
});
await db.logActivity({ nurseId, actionType: "probe", summary: "delete probe" });
console.log("children made   : cred", credId, "training", trainingId, "assignment", assignmentId, "emailLog", logId);

await db.deleteNurse(nurseId);
console.log("deleteNurse     : returned without throwing");

const counts = await handle.execute(sql`
  SELECT
    (SELECT count(*) FROM "nurses"           WHERE id = ${nurseId})      AS nurse,
    (SELECT count(*) FROM "nurseCredentials" WHERE "nurseId" = ${nurseId}) AS creds,
    (SELECT count(*) FROM "nurseTrainings"   WHERE "nurseId" = ${nurseId}) AS trainings,
    (SELECT count(*) FROM "areaAssignments"  WHERE "nurseId" = ${nurseId}) AS assignments,
    (SELECT count(*) FROM "emailLogs"        WHERE "nurseId" = ${nurseId}) AS emails,
    (SELECT count(*) FROM "activityLog"      WHERE "nurseId" = ${nurseId}) AS activity
`);
console.log("leftovers       :", JSON.stringify(counts[0] ?? counts));

const total = await handle.execute(sql`SELECT count(*)::int AS n FROM "nurses"`);
console.log("nurses remaining:", total[0].n);

process.exit(0);
