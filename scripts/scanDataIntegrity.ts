import { getSqliteDb } from "../server/localDb";
import { getDb } from "../server/db";
import { nurses, nurseCredentials, nurseTrainings, areaAssignments, areas, credentialTypes, trainingCatalog } from "../drizzle/schema";

async function runScan() {
  console.log("=== STARTING DATA INTEGRITY & DUPLICATE SCAN ===");
  const db = await getDb();
  
  let allNurses: any[] = [];
  let allCreds: any[] = [];
  let allTrainings: any[] = [];
  let allAreas: any[] = [];
  let allAssignments: any[] = [];
  let allCredTypes: any[] = [];

  if (db) {
    console.log("Database Mode: MySQL");
    allNurses = await db.select().from(nurses);
    allCreds = await db.select().from(nurseCredentials);
    allTrainings = await db.select().from(nurseTrainings);
    allAreas = await db.select().from(areas);
    allAssignments = await db.select().from(areaAssignments);
    allCredTypes = await db.select().from(credentialTypes);
  } else {
    console.log("Database Mode: SQLite (local.db)");
    const sqlite = getSqliteDb();
    allNurses = sqlite.prepare("SELECT * FROM nurses").all();
    allCreds = sqlite.prepare("SELECT * FROM nurseCredentials").all();
    allTrainings = sqlite.prepare("SELECT * FROM nurseTrainings").all();
    allAreas = sqlite.prepare("SELECT * FROM areas").all();
    allAssignments = sqlite.prepare("SELECT * FROM areaAssignments").all();
    allCredTypes = sqlite.prepare("SELECT * FROM credentialTypes").all();
  }

  console.log(`Total Records Loaded:`);
  console.log(`- Staff/Nurses: ${allNurses.length}`);
  console.log(`- Credentials/Licenses: ${allCreds.length}`);
  console.log(`- Training Records: ${allTrainings.length}`);
  console.log(`- Areas: ${allAreas.length}`);
  console.log(`- Area Assignments: ${allAssignments.length}`);
  console.log(`- Credential Types: ${allCredTypes.length}`);
  console.log("--------------------------------------------------");

  // 1. Check Duplicate Nurses
  const nursesByName = new Map<string, any[]>();
  const nursesByEmpId = new Map<string, any[]>();
  const nursesByEmail = new Map<string, any[]>();

  const missingEmpId: any[] = [];
  const missingArea: any[] = [];
  const missingDateHired: any[] = [];
  const missingPosition: any[] = [];

  for (const n of allNurses) {
    const fullName = `${n.firstName || ""} ${n.lastName || ""}`.trim().toLowerCase().replace(/\s+/g, " ");
    if (fullName) {
      if (!nursesByName.has(fullName)) nursesByName.set(fullName, []);
      nursesByName.get(fullName)!.push(n);
    }

    const empId = (n.employeeId || "").trim().toLowerCase();
    if (empId) {
      if (!nursesByEmpId.has(empId)) nursesByEmpId.set(empId, []);
      nursesByEmpId.get(empId)!.push(n);
    } else {
      missingEmpId.push(n);
    }

    if (n.accountEmail) {
      const email = n.accountEmail.trim().toLowerCase();
      if (!nursesByEmail.has(email)) nursesByEmail.set(email, []);
      nursesByEmail.get(email)!.push(n);
    }

    if (!n.currentAreaId) missingArea.push(n);
    if (!n.dateHired) missingDateHired.push(n);
    if (!n.position) missingPosition.push(n);
  }

  const dupNameGroups = Array.from(nursesByName.entries()).filter(([_, list]) => list.length > 1);
  const dupEmpIdGroups = Array.from(nursesByEmpId.entries()).filter(([_, list]) => list.length > 1);
  const dupEmailGroups = Array.from(nursesByEmail.entries()).filter(([_, list]) => list.length > 1);

  console.log(`\n[1] STAFF / NURSE DUPLICATES & GAPS:`);
  console.log(`- Duplicate Names: ${dupNameGroups.length} groups`);
  dupNameGroups.forEach(([name, list]) => {
    console.log(`  * Name "${name}": ${list.map(x => `ID ${x.id} (Emp: ${x.employeeId})`).join(", ")}`);
  });
  console.log(`- Duplicate Employee IDs: ${dupEmpIdGroups.length} groups`);
  dupEmpIdGroups.forEach(([empId, list]) => {
    console.log(`  * EmpID "${empId}": ${list.map(x => `ID ${x.id} (${x.firstName} ${x.lastName})`).join(", ")}`);
  });
  console.log(`- Duplicate Emails: ${dupEmailGroups.length} groups`);
  console.log(`- Staff Missing Employee ID: ${missingEmpId.length}`);
  console.log(`- Staff Missing Assigned Area: ${missingArea.length}`);
  console.log(`- Staff Missing Date Hired: ${missingDateHired.length}`);
  console.log(`- Staff Missing Position: ${missingPosition.length}`);

  // 2. Check Credentials / Licenses
  const credsByNumber = new Map<string, any[]>();
  const credsByNurseAndType = new Map<string, any[]>();
  const credsMissingLicenseNum: any[] = [];
  const credsMissingExpiry: any[] = [];
  const credsMissingDoc: any[] = [];

  for (const c of allCreds) {
    const licNum = (c.licenseNumber || "").trim().toLowerCase();
    if (licNum) {
      if (!credsByNumber.has(licNum)) credsByNumber.set(licNum, []);
      credsByNumber.get(licNum)!.push(c);
    } else {
      credsMissingLicenseNum.push(c);
    }

    const nurseTypeKey = `${c.nurseId}-${c.credentialTypeId}`;
    if (!credsByNurseAndType.has(nurseTypeKey)) credsByNurseAndType.set(nurseTypeKey, []);
    credsByNurseAndType.get(nurseTypeKey)!.push(c);

    if (!c.expiryDate) credsMissingExpiry.push(c);
    if (!c.documentKey) credsMissingDoc.push(c);
  }

  const dupLicGroups = Array.from(credsByNumber.entries()).filter(([_, list]) => list.length > 1);
  const dupNurseTypeCreds = Array.from(credsByNurseAndType.entries()).filter(([_, list]) => list.length > 1);

  console.log(`\n[2] CREDENTIALS / LICENSE DUPLICATES & GAPS:`);
  console.log(`- Duplicate License Numbers Across Staff: ${dupLicGroups.length} groups`);
  dupLicGroups.forEach(([lic, list]) => {
    console.log(`  * License "${lic}": ${list.map(x => `Cred ID ${x.id} (Nurse ID ${x.nurseId})`).join(", ")}`);
  });
  console.log(`- Multiple Credential Records for Same Nurse & Type: ${dupNurseTypeCreds.length} instances`);
  console.log(`- Credentials Missing License Number: ${credsMissingLicenseNum.length}`);
  console.log(`- Credentials Missing Expiry Date: ${credsMissingExpiry.length}`);
  console.log(`- Credentials Missing Uploaded Document/Proof: ${credsMissingDoc.length}`);

  // 3. Check Training Records
  const trainingsByNurseAndItemAndDate = new Map<string, any[]>();
  const trainingsMissingDate: any[] = [];
  const trainingsMissingCertificate: any[] = [];

  for (const t of allTrainings) {
    const d = String(t.completionDate || t.scheduledDate || "").slice(0, 10);
    const key = `${t.nurseId}-${t.trainingId}-${d}`;
    if (!trainingsByNurseAndItemAndDate.has(key)) trainingsByNurseAndItemAndDate.set(key, []);
    trainingsByNurseAndItemAndDate.get(key)!.push(t);

    if (!t.completionDate && !t.scheduledDate) trainingsMissingDate.push(t);
    if (!t.certificateKey && !t.certificateNumber) trainingsMissingCertificate.push(t);
  }

  const dupTrainings = Array.from(trainingsByNurseAndItemAndDate.entries()).filter(([_, list]) => list.length > 1);

  console.log(`\n[3] TRAINING RECORD DUPLICATES & GAPS:`);
  console.log(`- Duplicate Training Entries (Same Nurse, Training, & Date): ${dupTrainings.length} instances`);
  console.log(`- Trainings Missing Date: ${trainingsMissingDate.length}`);
  console.log(`- Trainings Missing Certificate/Proof: ${trainingsMissingCertificate.length}`);

  // 4. Check Area Assignments
  const assignmentsByNurseAndDate = new Map<string, any[]>();
  for (const a of allAssignments) {
    const key = `${a.nurseId}-${a.areaId}-${String(a.effectiveDate || "").slice(0, 10)}`;
    if (!assignmentsByNurseAndDate.has(key)) assignmentsByNurseAndDate.set(key, []);
    assignmentsByNurseAndDate.get(key)!.push(a);
  }
  const dupAssignments = Array.from(assignmentsByNurseAndDate.entries()).filter(([_, list]) => list.length > 1);

  console.log(`\n[4] AREA ASSIGNMENT DUPLICATES:`);
  console.log(`- Duplicate Area Assignments (Same Nurse, Area, Effective Date): ${dupAssignments.length} instances`);

  console.log("\n=== SCAN COMPLETE ===");
}

runScan().catch(err => {
  console.error("Scan error:", err);
  process.exit(1);
});
