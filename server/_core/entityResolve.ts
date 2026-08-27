/** Resolves free-text names the AI read off a document against existing DB records, with a confidence score. */
import { nurseFullName } from "../../shared/nursetrack";

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Best-match lookup: 1.0 exact (case/space-insensitive), 0.6 one-side-contains-other, else null. */
export function resolveByName<T>(query: string | null | undefined, items: T[], nameOf: (item: T) => string): { item: T | null; confidence: number } {
  if (!query || !query.trim()) return { item: null, confidence: 0 };
  const q = normalize(query);
  for (const item of items) {
    if (normalize(nameOf(item)) === q) return { item, confidence: 1 };
  }
  let best: T | null = null;
  let bestLen = 0;
  for (const item of items) {
    const n = normalize(nameOf(item));
    if ((n.includes(q) || q.includes(n)) && n.length > bestLen) {
      best = item;
      bestLen = n.length;
    }
  }
  if (best) return { item: best, confidence: 0.6 };
  return { item: null, confidence: 0 };
}

/** Nurse matching: prefer exact employeeId match (1.0), fall back to full-name match (lower confidence). */
export function resolveNurse<T extends { id: number; employeeId: string; firstName: string; middleName?: string | null; lastName: string; suffix?: string | null }>(
  employeeIdGuess: string | null | undefined,
  nameGuess: string | null | undefined,
  nurses: T[],
): { nurseId: number | null; confidence: number } {
  if (employeeIdGuess && employeeIdGuess.trim()) {
    const q = normalize(employeeIdGuess);
    const match = nurses.find((n) => normalize(n.employeeId) === q);
    if (match) return { nurseId: match.id, confidence: 1 };
  }
  const { item, confidence } = resolveByName(nameGuess, nurses, nurseFullName);
  return { nurseId: item ? item.id : null, confidence: item ? confidence * 0.85 : 0 };
}
