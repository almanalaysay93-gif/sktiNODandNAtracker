/** Sends extracted document text to Nemotron 3 (via OpenRouter) and gets back structured, still-unresolved rows. */
import { z } from "zod";
import { SMART_IMPORT_FIELDS, SMART_IMPORT_KINDS, SMART_IMPORT_MAX_ROWS, type SmartImportKind } from "../../shared/smartImport";
import { todayDate } from "../../shared/nursetrack";
import { ENV } from "./env";

const fieldValueSchema = z.object({
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]).nullable(),
  confidence: z.number().min(0).max(1),
});

const aiRowSchema = z.object({
  kind: z.enum(SMART_IMPORT_KINDS),
  nurseEmployeeIdGuess: z.string().nullable().optional(),
  nurseNameGuess: z.string().nullable().optional(),
  fields: z.record(z.string(), fieldValueSchema),
  sourceExcerpt: z.string().default(""),
});

const aiResponseSchema = z.object({ rows: z.array(aiRowSchema) });

export type AiExtractedRow = z.infer<typeof aiRowSchema>;

export type AiExtractionContext = {
  existingNurses: { employeeId: string; name: string }[];
  existingAreas: string[];
  existingCredentialTypes: string[];
  existingTrainingCatalog: string[];
};

function buildPrompt(text: string, context: AiExtractionContext): string {
  const fieldSchemaDoc = SMART_IMPORT_KINDS.map((kind) => {
    const fields = SMART_IMPORT_FIELDS[kind];
    const fieldDocs = Object.entries(fields)
      .map(([key, def]) => `    - ${key} (${def.type}${def.options ? `, one of: ${def.options.join(" | ")}` : ""}): ${def.label}`)
      .join("\n");
    return `  "${kind}":\n${fieldDocs}`;
  }).join("\n");

  return `You extract structured nurse-roster records from a document for a hospital nurse-tracking system. Today's date is ${todayDate()}.

Record kinds and their fields:
${fieldSchemaDoc}

Existing nurses (employeeId — full name), match against these when the document refers to a nurse:
${context.existingNurses.map((n) => `${n.employeeId} — ${n.name}`).join("\n") || "(none yet)"}

Existing areas: ${context.existingAreas.join(", ") || "(none yet)"}
Existing credential types: ${context.existingCredentialTypes.join(", ") || "(none yet)"}
Existing training/seminar/LDI catalog names: ${context.existingTrainingCatalog.join(", ") || "(none yet)"}

Document text:
"""
${text.slice(0, 40000)}
"""

Extract every distinct record you can find (e.g. a roster spreadsheet may contain one "nurse" row per line; a single certificate produces one "credential" or "training" row; a schedule sheet may produce "calendarEvent" rows). Do not invent data that is not present in the text. For dates, output ISO "YYYY-MM-DD". For enum fields, use exactly one of the listed options or leave the value null if unclear.

For every extracted value, include a confidence score 0-1 (1 = read verbatim and unambiguous, lower = inferred or unclear text).

For each row, also guess which existing nurse it belongs to via nurseEmployeeIdGuess (exact employeeId if visible in the text) and/or nurseNameGuess (the person's full name as written). Leave both null for a "nurse" row that looks like a brand-new hire not in the existing list, or for a "calendarEvent" row with no specific nurse.

Include a short sourceExcerpt (<=200 chars) of the raw text this row came from, for a human reviewer to cross-check.

Return at most ${SMART_IMPORT_MAX_ROWS} rows. Respond with ONLY a JSON object: { "rows": [ { "kind": ..., "nurseEmployeeIdGuess": ..., "nurseNameGuess": ..., "fields": { "<fieldKey>": { "value": ..., "confidence": ... }, ... }, "sourceExcerpt": ... }, ... ] }`;
}

export async function extractRecordsWithAi(text: string, context: AiExtractionContext): Promise<AiExtractedRow[]> {
  if (!ENV.openRouterApiKey) {
    throw new Error("Smart Import is not configured: OPENROUTER_API_KEY is missing.");
  }
  if (!text.trim()) {
    throw new Error("No readable text was found in this file.");
  }

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ENV.openRouterApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: ENV.openRouterModel,
      messages: [{ role: "user", content: buildPrompt(text, context) }],
      response_format: { type: "json_object" },
      temperature: 0.1,
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`AI extraction request failed (${response.status}): ${errText || response.statusText}`);
  }

  const json = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error("AI extraction returned an empty response.");

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("AI extraction returned malformed JSON.");
  }

  const result = aiResponseSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error("AI extraction returned an unexpected shape.");
  }
  return result.data.rows.slice(0, SMART_IMPORT_MAX_ROWS);
}

export function isKnownKind(kind: string): kind is SmartImportKind {
  return (SMART_IMPORT_KINDS as readonly string[]).includes(kind);
}
