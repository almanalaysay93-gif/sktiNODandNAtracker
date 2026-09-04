/**
 * Copy every row from the local SQLite database (server/data/local.db)
 * into the PostgreSQL database named by DATABASE_URL.
 *
 * Run the drizzle migrations first so the Postgres tables exist:
 *   pnpm exec drizzle-kit migrate
 *
 * Usage:
 *   node scripts/migrate-local-to-postgres.mjs             # dry run, prints the plan
 *   node scripts/migrate-local-to-postgres.mjs --apply     # write rows
 *   node scripts/migrate-local-to-postgres.mjs --apply --truncate   # clear targets first
 *
 * Ids are preserved and each table's id sequence is reset afterwards.
 * Tables that exist only in SQLite are skipped and reported.
 */
import "dotenv/config";
import Database from "better-sqlite3";
import postgres from "postgres";

const APPLY = process.argv.includes("--apply");
const TRUNCATE = process.argv.includes("--truncate");
const SQLITE_PATH = "server/data/local.db";
const BATCH_SIZE = 200;
const INT32_MAX = 2147483647;

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Add it to .env, then re-run.");
  process.exit(1);
}

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
const sql = postgres(url, { max: 1, onnotice: () => {} });

/** Table names here come from our own schema, but quote them anyway — they are camelCase. */
const ident = (name) => `"${name.replace(/"/g, '""')}"`;
const countRows = (name) => sql.unsafe(`SELECT count(*)::int AS n FROM ${ident(name)}`);

try {
  const [info] = await sql`SELECT current_database() AS db`;

  const columnRows = await sql`
    SELECT table_name, column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position
  `;

  /** table -> { column: dataType } */
  const target = new Map();
  /** "table.column" -> true when the column accepts NULL */
  const nullable = new Set();
  for (const row of columnRows) {
    if (!target.has(row.table_name)) target.set(row.table_name, {});
    target.get(row.table_name)[row.column_name] = row.data_type;
    if (row.is_nullable === "YES") nullable.add(`${row.table_name}.${row.column_name}`);
  }
  target.delete("__drizzle_migrations");

  const sqliteTables = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all()
    .map((row) => row.name);

  console.log(`source : ${SQLITE_PATH}`);
  console.log(`target : ${info.db} (${target.size} tables)`);
  console.log(`mode   : ${APPLY ? (TRUNCATE ? "APPLY + TRUNCATE" : "APPLY") : "DRY RUN"}\n`);

  const skipped = [];
  /** "table.column" -> how many values were blanked for overflowing `integer` */
  const oversized = new Map();
  let copied = 0;

  for (const table of sqliteTables) {
    const targetColumns = target.get(table);
    if (!targetColumns) {
      skipped.push(`${table} (no such table in Postgres)`);
      continue;
    }

    const rows = sqlite.prepare(`SELECT * FROM "${table}"`).all();
    if (rows.length === 0) {
      console.log(`${table.padEnd(28)} 0`);
      continue;
    }

    const columns = Object.keys(rows[0]).filter((name) => name in targetColumns);
    const droppedColumns = Object.keys(rows[0]).filter((name) => !(name in targetColumns));
    if (droppedColumns.length > 0) {
      skipped.push(`${table}.${droppedColumns.join(", ")} (column missing in Postgres)`);
    }

    if (!APPLY) {
      const [existing] = await countRows(table);
      console.log(`${table.padEnd(28)} ${String(rows.length).padStart(5)} -> target has ${existing.n}`);
      continue;
    }

    if (TRUNCATE) await sql.unsafe(`TRUNCATE TABLE ${ident(table)} RESTART IDENTITY CASCADE`);

    for (let offset = 0; offset < rows.length; offset += BATCH_SIZE) {
      const batch = rows.slice(offset, offset + BATCH_SIZE).map((row) => {
        const clean = {};
        for (const name of columns) {
          const value = convert(row[name], targetColumns[name]);
          // SQLite ints are 64-bit; Postgres `integer` is 32-bit. Local test runs left a few
          // Date.now() values in id-shaped columns, so blank those rather than fail the copy.
          if (targetColumns[name] === "integer" && typeof value === "number" && Math.abs(value) > INT32_MAX) {
            const key = `${table}.${name}`;
            if (!nullable.has(key)) throw new Error(`${key} holds ${value}, too large for integer and NOT NULL`);
            oversized.set(key, (oversized.get(key) ?? 0) + 1);
            clean[name] = null;
            continue;
          }
          clean[name] = value;
        }
        return clean;
      });
      await sql`INSERT INTO ${sql(table)} ${sql(batch, ...columns)}`;
    }

    // Ids were carried over verbatim, so the serial sequence must skip past them.
    if ("id" in targetColumns) {
      // pg_get_serial_sequence folds an unquoted name to lowercase, so pass the quoted identifier.
      await sql.unsafe(
        `SELECT setval(pg_get_serial_sequence('${ident(table)}', 'id'),` +
          ` COALESCE((SELECT max(id) FROM ${ident(table)}), 0) + 1, false)`
      );
    }

    const [after] = await countRows(table);
    copied += rows.length;
    console.log(`${table.padEnd(28)} ${String(rows.length).padStart(5)} copied -> target now ${after.n}`);
  }

  if (skipped.length > 0) {
    console.log("\nskipped:");
    for (const note of skipped) console.log(`  - ${note}`);
  }

  if (oversized.size > 0) {
    console.log("\nblanked (value too large for a 32-bit integer column):");
    for (const [column, count] of oversized) console.log(`  - ${column}: ${count} value(s) set to NULL`);
  }

  console.log(APPLY ? `\ndone. ${copied} rows copied.` : "\ndry run only. Re-run with --apply to write.");
} finally {
  await sql.end();
  sqlite.close();
}
