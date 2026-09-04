import postgres from "postgres";

const url = process.env.PG_URL;
if (!url) {
  console.log("PG_URL not provided");
  process.exit(1);
}

const sql = postgres(url, { max: 1 });
try {
  const [info] = await sql`SELECT current_database() AS db, version() AS version`;
  console.log("connected :", info.db);
  console.log("server    :", info.version.split(" on ")[0]);
  const tables = await sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`;
  console.log("tables    :", tables.length ? tables.map((t) => t.table_name).join(", ") : "(empty)");
} catch (error) {
  console.log("FAILED:", error.code ?? "", error.message);
} finally {
  await sql.end();
}
