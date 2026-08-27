/** AI Insights: Nemotron 3 (via OpenRouter) reads a compact snapshot of the current
 * roster/license/training data and either writes a report or answers a chat question. */
import * as db from "../db";
import {
  daysUntilExpiry,
  deriveLicenseStatus,
  nurseFullName,
  todayDate,
  trainingCompliance,
} from "../../shared/nursetrack";
import { ENV } from "./env";

export type ChatMessage = { role: "user" | "assistant"; content: string };

async function buildDataDigest() {
  const [nurses, areas, credentials, trainingRecords, credentialTypes, trainingCatalog] = await Promise.all([
    db.listNurses(),
    db.listAreas(false),
    db.listCredentials(),
    db.listNurseTrainings(),
    db.listCredentialTypes(false),
    db.listTrainingCatalog(false),
  ]);

  const today = todayDate();
  const areaById = new Map(areas.map((a) => [a.id, a]));
  const credTypeById = new Map(credentialTypes.map((t) => [t.id, t]));
  const catalogById = new Map(trainingCatalog.map((t) => [t.id, t]));
  const credsByNurse = new Map<number, typeof credentials>();
  for (const c of credentials) {
    if (!credsByNurse.has(c.nurseId)) credsByNurse.set(c.nurseId, []);
    credsByNurse.get(c.nurseId)!.push(c);
  }
  const trainingsByNurse = new Map<number, typeof trainingRecords>();
  for (const t of trainingRecords) {
    if (!trainingsByNurse.has(t.nurseId)) trainingsByNurse.set(t.nurseId, []);
    trainingsByNurse.get(t.nurseId)!.push(t);
  }

  const activeNurses = nurses.filter((n) => !n.archivedAt && n.employmentStatus !== "Archived");

  const areaCounts = new Map<string, number>();
  for (const n of activeNurses) {
    const name = n.currentAreaId ? (areaById.get(n.currentAreaId)?.name ?? "Unknown") : "Unassigned";
    areaCounts.set(name, (areaCounts.get(name) ?? 0) + 1);
  }

  const roster = activeNurses.map((n) => {
    const areaName = n.currentAreaId ? (areaById.get(n.currentAreaId)?.name ?? "Unknown") : "Unassigned";
    const creds = credsByNurse.get(n.id) ?? [];
    const soonestCred = creds
      .slice()
      .sort((a, b) => daysUntilExpiry(a.expiryDate as string, today) - daysUntilExpiry(b.expiryDate as string, today))[0];
    const licenseInfo = soonestCred
      ? `${deriveLicenseStatus(soonestCred.expiryDate as string, today)} (${daysUntilExpiry(soonestCred.expiryDate as string, today)}d, ${credTypeById.get(soonestCred.credentialTypeId)?.name ?? "license"})`
      : "no license on file";
    const scheduled = (trainingsByNurse.get(n.id) ?? []).filter((t) => t.status === "Scheduled" && t.scheduledDate);
    return {
      name: nurseFullName(n),
      employeeId: n.employeeId,
      staffType: n.staffType,
      area: areaName,
      license: licenseInfo,
      upcomingTrainings: scheduled.map((t) => `${catalogById.get(t.trainingId)?.name ?? "training"} on ${t.scheduledDate}`),
    };
  });

  // Near-term focus lists for the report prompt.
  const expiringSoon = roster
    .map((r) => ({ ...r }))
    .filter((r) => r.license.startsWith("Expired") || r.license.startsWith("Within 6 Months") || r.license.startsWith("Within 1 Year"))
    .sort((a, b) => (a.license < b.license ? -1 : 1));

  const upcomingEvents = trainingRecords
    .filter((t) => t.status === "Scheduled" && t.scheduledDate)
    .map((t) => {
      const nurse = activeNurses.find((n) => n.id === t.nurseId);
      return nurse
        ? { name: nurseFullName(nurse), training: catalogById.get(t.trainingId)?.name ?? "training", date: t.scheduledDate }
        : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));

  // Simple compliance snapshot per area (only areas with a training requirement set are meaningful,
  // but we surface active-nurse counts vs completed-training coverage generically here).
  const complianceByArea: Record<string, number> = {};
  for (const area of areas) {
    const nursesInArea = activeNurses.filter((n) => n.currentAreaId === area.id);
    if (nursesInArea.length === 0) continue;
    const records = nursesInArea.flatMap((n) => (trainingsByNurse.get(n.id) ?? []).map((t) => ({ trainingId: t.trainingId, status: t.status, expiryDate: t.expiryDate, completionDate: t.completionDate })));
    const requiredIds = Array.from(new Set(records.map((r) => r.trainingId)));
    if (requiredIds.length === 0) continue;
    complianceByArea[area.name] = trainingCompliance({ requiredTrainingIds: requiredIds, nurseTrainingRecords: records, today });
  }

  return { today, activeCount: activeNurses.length, areaCounts: Object.fromEntries(areaCounts), roster, expiringSoon, upcomingEvents, complianceByArea };
}

function formatDigestForReport(d: Awaited<ReturnType<typeof buildDataDigest>>): string {
  const lines: string[] = [];
  lines.push(`Today: ${d.today}. Active staff: ${d.activeCount}.`);
  lines.push(`Staff by area: ${Object.entries(d.areaCounts).map(([k, v]) => `${k}=${v}`).join(", ")}`);
  lines.push("");
  lines.push(`Licenses expired or expiring within 1 year (${d.expiringSoon.length}):`);
  for (const r of d.expiringSoon.slice(0, 150)) {
    lines.push(`- ${r.name} (${r.employeeId}, ${r.area}): ${r.license}`);
  }
  lines.push("");
  lines.push(`Scheduled upcoming trainings/seminars (${d.upcomingEvents.length}):`);
  for (const e of d.upcomingEvents.slice(0, 150)) {
    lines.push(`- ${e.name}: ${e.training} on ${e.date}`);
  }
  if (Object.keys(d.complianceByArea).length) {
    lines.push("");
    lines.push("Rough training-record coverage % by area (based on trainings actually on file, not official requirements):");
    for (const [area, pct] of Object.entries(d.complianceByArea)) lines.push(`- ${area}: ${pct}%`);
  }
  return lines.join("\n");
}

function formatDigestForChat(d: Awaited<ReturnType<typeof buildDataDigest>>): string {
  const lines: string[] = [];
  lines.push(`Today: ${d.today}. Active staff: ${d.activeCount}.`);
  lines.push(`Staff by area: ${Object.entries(d.areaCounts).map(([k, v]) => `${k}=${v}`).join(", ")}`);
  lines.push("");
  lines.push("Full active roster (name | employeeId | staffType | area | license status):");
  for (const r of d.roster) {
    lines.push(`- ${r.name} | ${r.employeeId} | ${r.staffType} | ${r.area} | ${r.license}${r.upcomingTrainings.length ? " | upcoming: " + r.upcomingTrainings.join("; ") : ""}`);
  }
  return lines.join("\n");
}

async function callOpenRouter(messages: Array<{ role: string; content: string }>): Promise<string> {
  if (!ENV.openRouterApiKey) {
    throw new Error("AI Insights is not configured: OPENROUTER_API_KEY is missing.");
  }
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ENV.openRouterApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: ENV.openRouterModel, messages, temperature: 0.3 }),
  });
  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`AI request failed (${response.status}): ${errText || response.statusText}`);
  }
  const json = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error("AI request returned an empty response.");
  return content;
}

export async function generateInsightsReport(): Promise<string> {
  const digest = await buildDataDigest();
  const prompt = `You are a nurse-staffing analyst for a hospital nephrology department. Below is today's roster/license/training data snapshot. Write a concise report (use short headed sections, plain text, no markdown tables) covering:
1. Urgent license expirations (expired or expiring within 30 days) — name each person.
2. Licenses expiring within 6 months — summarize, group by area if there are many.
3. Upcoming trainings/seminars in the next 60 days — list them.
4. Any notable staffing pattern you can see from the area counts (e.g. heavy imbalance between areas), stated as an observation, not a recommendation you're not qualified to make.
Be factual and specific using only the data given below. If a section has nothing to report, say so briefly.

DATA:
${formatDigestForReport(digest)}`;

  return callOpenRouter([{ role: "user", content: prompt }]);
}

export async function answerInsightsChat(question: string, history: ChatMessage[]): Promise<string> {
  const digest = await buildDataDigest();
  const systemPrompt = `You are a nurse-staffing data assistant for a hospital nephrology department's tracking app. Answer the supervisor's questions using ONLY the roster/license/training data provided below — never invent people or numbers not present in it. Keep answers short and direct. If the data doesn't contain the answer, say so.

DATA:
${formatDigestForChat(digest)}`;

  const messages = [
    { role: "system", content: systemPrompt },
    ...history.slice(-10).map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: question },
  ];
  return callOpenRouter(messages);
}
