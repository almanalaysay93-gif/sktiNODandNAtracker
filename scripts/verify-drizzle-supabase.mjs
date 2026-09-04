import "dotenv/config";
import { getDb } from "../server/db.ts";
import { nurses, users, areas, trainingCatalog } from "../drizzle/schema.ts";
import { count } from "drizzle-orm";

async function verify() {
  const db = await getDb();
  if (!db) {
    throw new Error("getDb() returned null");
  }

  const [nurseCount] = await db.select({ count: count() }).from(nurses);
  const [userCount] = await db.select({ count: count() }).from(users);
  const [areaCount] = await db.select({ count: count() }).from(areas);
  const [catalogCount] = await db.select({ count: count() }).from(trainingCatalog);

  console.log("Supabase NurseTrack DB Verification:");
  console.log("  Nurses count          :", nurseCount.count);
  console.log("  Users count           :", userCount.count);
  console.log("  Areas count           :", areaCount.count);
  console.log("  Training catalog count:", catalogCount.count);

  process.exit(0);
}

verify().catch(err => {
  console.error("Verification failed:", err);
  process.exit(1);
});
