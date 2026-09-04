import Database from "better-sqlite3";
import postgres from "postgres";

const SQLITE_PATH = "server/data/local.db";
const BATCH_SIZE = 200;
const INT32_MAX = 2147483647;

const connectionString = "postgresql://postgres.oaxgmvsxzfkyqzmfwxtn:Roshie121522!@aws-0-ap-southeast-2.pooler.supabase.com:6543/postgres";

/** SQLite keeps every timestamp as TEXT; Postgres wants 'YYYY-MM-DD HH:MM:SS' in UTC. */
function toTimestampText(value, dateOnly) {
  if (value === null || value === undefined || value === "") return null;
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return dateOnly ? raw : `${raw} 00:00:00`;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(raw)) return dateOnly ? raw.slice(0, 10) : raw.slice(0, 19);

  const parsed = typeof value === "number" ? new Date(value) : new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  const iso = parsed.toISOString();
  return dateOnly ? iso.slice(0, 10) : iso.slice(0, 19).replace("T", " ");
}

function convert(value, dataType) {
  if (value === null || value === undefined) return null;
  const type = dataType.toLowerCase();
  if (type === "date") return toTimestampText(value, true);
  if (type.startsWith("timestamp")) return toTimestampText(value, false);
  if (type === "boolean") return value === "0" || value === "false" ? false : Boolean(value);
  if (type === "integer" || type === "bigint" || type === "smallint") return Number(value);
  if (type === "json" || type === "jsonb") {
    if (typeof value !== "string") return JSON.stringify(value);
    try {
      JSON.parse(value);
      return value;
    } catch {
      return JSON.stringify(value);
    }
  }
  return value;
}

const sqlite = new Database(SQLITE_PATH, { readonly: true });
const sql = postgres(connectionString, { max: 1, onnotice: () => {} });

const ident = (name) => `"${name.replace(/"/g, '""')}"`;

// Ordered to satisfy foreign key dependencies
const ORDERED_TABLES = [
  "areas",
  "credentialTypes",
  "trainingCatalog",
  "trainingEvents",
  "users",
  "nurses",
  "areaAssignments",
  "nurseCredentials",
  "nurseTrainings",
  "areaTrainingRequirements",
  "activityLog",
  "appSettings",
  "customCalendarEvents",
  "emailLogs",
  "licenseReminders",
  "notifications"
];

async function main() {
  console.log("Starting data migration from SQLite to Supabase schema 'nursetrack'...\n");

  await sql`SET search_path TO nursetrack`;

  const columnRows = await sql`
    SELECT table_name, column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'nursetrack'
    ORDER BY table_name, ordinal_position
  `;

  const target = new Map();
  const nullable = new Set();
  for (const row of columnRows) {
    if (!target.has(row.table_name)) target.set(row.table_name, {});
    target.get(row.table_name)[row.column_name] = row.data_type;
    if (row.is_nullable === "YES") nullable.add(`${row.table_name}.${row.column_name}`);
  }

  let totalCopied = 0;

  for (const table of ORDERED_TABLES) {
    const targetColumns = target.get(table);
    if (!targetColumns) {
      console.log(`Skipping ${table}: not found in Postgres schema 'nursetrack'`);
      continue;
    }

    // Check if table exists in SQLite
    const hasSqlite = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?")
      .get(table);

    if (!hasSqlite) {
      console.log(`Skipping ${table}: not found in SQLite`);
      continue;
    }

    const rows = sqlite.prepare(`SELECT * FROM "${table}"`).all();
    if (rows.length === 0) {
      console.log(`${table.padEnd(28)}: 0 rows`);
      continue;
    }

    const columns = Object.keys(rows[0]).filter((name) => name in targetColumns);

    // Truncate target table inside nursetrack first
    await sql.unsafe(`TRUNCATE TABLE nursetrack.${ident(table)} RESTART IDENTITY CASCADE`);

    for (let offset = 0; offset < rows.length; offset += BATCH_SIZE) {
      const batch = rows.slice(offset, offset + BATCH_SIZE).map((row) => {
        const clean = {};
        for (const name of columns) {
          const value = convert(row[name], targetColumns[name]);
          if (targetColumns[name] === "integer" && typeof value === "number" && Math.abs(value) > INT32_MAX) {
            const key = `${table}.${name}`;
            if (!nullable.has(key)) throw new Error(`${key} holds ${value}, too large for integer and NOT NULL`);
            clean[name] = null;
            continue;
          }
          clean[name] = value;
        }
        return clean;
      });

      await sql`INSERT INTO ${sql('nursetrack.' + table)} ${sql(batch, ...columns)}`;
    }

    // Reset sequence if id column exists
    if ("id" in targetColumns) {
      try {
        await sql.unsafe(
          `SELECT setval(pg_get_serial_sequence('nursetrack.${table}', 'id'), ` +
          `COALESCE((SELECT max(id) FROM nursetrack.${ident(table)}), 0) + 1, false)`
        );
      } catch (seqErr) {
        console.warn(`Could not reset sequence for ${table}:`, seqErr.message);
      }
    }

    const [after] = await sql.unsafe(`SELECT count(*)::int AS n FROM nursetrack.${ident(table)}`);
    totalCopied += rows.length;
    console.log(`${table.padEnd(28)}: ${String(rows.length).padStart(5)} rows copied -> target verified ${after.n}`);
  }

  console.log(`\nData migration complete! Total rows migrated: ${totalCopied}`);

  await sql.end();
  sqlite.close();
}

main().catch(err => {
  console.error("Migration failed:", err);
  process.exit(1);
});
