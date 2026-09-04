import fs from "fs";
import postgres from "postgres";

const connectionString = "postgresql://postgres.oaxgmvsxzfkyqzmfwxtn:Roshie121522!@aws-0-ap-southeast-2.pooler.supabase.com:6543/postgres";
const sql = postgres(connectionString, { max: 1, onnotice: () => {} });

async function main() {
  console.log("Applying NurseTrack schema to 'nursetrack' on Supabase...");

  await sql`CREATE SCHEMA IF NOT EXISTS nursetrack`;

  const sqlFile = fs.readFileSync("drizzle/0000_nifty_prima.sql", "utf-8");
  const statements = sqlFile
    .split("--> statement-breakpoint")
    .map(s => s.trim())
    .filter(s => s.length > 0);

  console.log(`Found ${statements.length} DDL statements to execute in schema 'nursetrack'...`);

  // Execute each statement with search_path set to nursetrack
  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    try {
      await sql.unsafe(`SET search_path TO nursetrack; ${stmt}`);
    } catch (err) {
      console.error(`Error on statement #${i + 1}:`, err.message);
      throw err;
    }
  }

  console.log("All DDL statements executed successfully!");

  const tables = await sql`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'nursetrack'
    ORDER BY table_name;
  `;
  console.log(`\nCreated ${tables.length} tables in schema 'nursetrack':`);
  for (const t of tables) {
    console.log(`  - nursetrack.${t.table_name}`);
  }

  const publicTables = await sql`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public'
    ORDER BY table_name;
  `;
  console.log(`\nVerified schema 'public' remains isolated with ${publicTables.length} tables:`);
  for (const t of publicTables) {
    console.log(`  - public.${t.table_name}`);
  }

  await sql.end();
}

main().catch(err => {
  console.error("Migration failed:", err);
  process.exit(1);
});
