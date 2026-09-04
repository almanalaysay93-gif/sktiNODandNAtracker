import postgres from "postgres";

const connectionString = "postgresql://postgres.oaxgmvsxzfkyqzmfwxtn:Roshie121522!@aws-0-ap-southeast-2.pooler.supabase.com:6543/postgres";
const sql = postgres(connectionString, { max: 1, onnotice: () => {} });

async function main() {
  console.log("Connecting to Supabase pooler...");
  const [db] = await sql`SELECT current_database(), current_user, version()`;
  console.log("Connected:", db);

  console.log("Ensuring schema 'nursetrack' exists...");
  await sql`CREATE SCHEMA IF NOT EXISTS nursetrack`;
  console.log("Schema 'nursetrack' verified.");

  const tables = await sql`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'nursetrack'
    ORDER BY table_name;
  `;
  console.log(`Current tables in 'nursetrack': ${tables.length}`);
  for (const t of tables) {
    console.log("  -", t.table_name);
  }

  const publicTables = await sql`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public'
    ORDER BY table_name;
  `;
  console.log(`Current tables in 'public' (Dialysis Occupancy Board): ${publicTables.length}`);

  await sql.end();
}

main().catch(err => {
  console.error("Setup failed:", err);
  process.exit(1);
});
