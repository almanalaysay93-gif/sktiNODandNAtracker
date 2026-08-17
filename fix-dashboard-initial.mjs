import { readFileSync, writeFileSync } from "fs";

const p = "client/src/pages/Dashboard.tsx";
let s = readFileSync(p, "utf8");

// Replace the five separate queries with one merged initial() query.
const old = [
  'const { data: summary, isLoading: summaryLoading } = trpc.dashboard.summary.useQuery();',
  'const { data: actionCenter, isLoading: actionLoading } = trpc.dashboard.actionCenter.useQuery();',
  'const { data: areas, isLoading: areasLoading } = trpc.dashboard.areaSnapshots.useQuery();',
  'const { data: feed, isLoading: feedLoading } = trpc.dashboard.activityFeed.useQuery({ limit: 20 });',
  'const { data: upcoming, isLoading: upcomingLoading } = trpc.dashboard.upcoming.useQuery();',
];
const first = old[0].indexOf("const");
const last = old[4].indexOf(";") + 1;
const idx = s.indexOf(old[0]);
if (idx === -1) {
  console.error("Could not find query block");
  process.exit(1);
}
const newBlock = `const { data: initial, isLoading: initialLoading } = trpc.dashboard.initial.useQuery();
  const summary = initial?.summary;
  const actionCenter = initial?.actionCenter;
  const areas = initial?.areaSnapshots;
  const feed = initial?.activityFeed;
  const upcoming = initial?.upcoming;
  const summaryLoading = initialLoading;
  const actionLoading = initialLoading;
  const areasLoading = initialLoading;
  const feedLoading = initialLoading;
  const upcomingLoading = initialLoading;`;

s = s.slice(0, idx) + newBlock + s.slice(idx + old.join("\n  ").length - 2);
// The slice math: simpler to just replace the contiguous block by index+length.
const blockLen = idx + (`  const { data: upcoming, isLoading: upcomingLoading } = trpc.dashboard.upcoming.useQuery();`.length) - idx;
s = readFileSync(p, "utf8");
const endMarker = 'trpc.dashboard.upcoming.useQuery();';
const endIdx = s.indexOf(endMarker, idx);
s = s.slice(0, idx) + newBlock + s.slice(endIdx + endMarker.length);

writeFileSync(p, s);
console.log("Dashboard.tsx updated");
