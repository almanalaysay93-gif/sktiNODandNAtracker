import postgres from "postgres";

const connectionString = "postgresql://postgres.oaxgmvsxzfkyqzmfwxtn:Roshie121522!@aws-0-ap-southeast-2.pooler.supabase.com:6543/postgres";
const sql = postgres(connectionString, { max: 1, onnotice: () => {} });

async function main() {
  console.log("Synchronizing serial sequences in schema 'nursetrack'...");

  const tables = [
    "activityLog",
    "appSettings",
    "areaAssignments",
    "areaTrainingRequirements",
    "areas",
    "credentialTypes",
    "customCalendarEvents",
    "emailLogs",
    "licenseReminders",
    "notifications",
    "nurseCredentials",
    "nurseTrainings",
    "nurses",
    "trainingCatalog",
    "trainingEvents",
    "users"
  ];

  for (const table of tables) {
    try {
      const [{ maxId }] = await sql.unsafe(`SELECT COALESCE(MAX(id), 0) AS "maxId" FROM nursetrack."${table}"`);
      const nextId = Number(maxId) + 1;
      const seqName = `nursetrack."${table}_id_seq"`;
      await sql.unsafe(`SELECT setval('${seqName}', ${nextId}, false)`);
      console.log(`Sequence for nursetrack."${table}": max id = ${maxId}, next id = ${nextId}`);
    } catch (e) {
      console.warn(`Could not set sequence for ${table}:`, e.message);
    }
  }

  console.log("Sequence synchronization complete.");
  await sql.end();
}

main().catch(err => {
  console.error("Failed:", err);
  process.exit(1);
});
