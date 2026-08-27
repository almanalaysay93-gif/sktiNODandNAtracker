import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { REFERENCE_FIELDS, SMART_IMPORT_FIELDS, actionsForKind, type SmartImportRow } from "../../../../shared/smartImport";
import { nurseFullName } from "../../../../shared/nursetrack";
import { Trash2 } from "lucide-react";
import { useState } from "react";

type LookupItem = { id: number; name: string };
type NurseOption = { id: number; employeeId: string; firstName: string; middleName?: string | null; lastName: string; suffix?: string | null };

const KIND_LABELS: Record<string, string> = {
  nurse: "Nurse",
  credential: "Credential",
  training: "Training / Seminar",
  areaAssignment: "Area Assignment",
  calendarEvent: "Calendar Event",
};

function confidenceClass(confidence: number) {
  if (confidence >= 0.7) return "";
  if (confidence >= 0.4) return "bg-yellow-50 dark:bg-yellow-950/30 border-yellow-400";
  return "bg-amber-100 dark:bg-amber-950/40 border-amber-500";
}

export function SmartImportRowCard({
  row,
  nurses,
  areas,
  credentialTypes,
  trainingCatalog,
  onChange,
  onRemove,
}: {
  row: SmartImportRow;
  nurses: NurseOption[];
  areas: LookupItem[];
  credentialTypes: LookupItem[];
  trainingCatalog: LookupItem[];
  onChange: (next: SmartImportRow) => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const fieldDefs = SMART_IMPORT_FIELDS[row.kind];
  const showsNursePicker = row.kind !== "calendarEvent";

  function setField(key: string, value: string | number | boolean | null, refId?: number | null) {
    onChange({
      ...row,
      fields: { ...row.fields, [key]: { ...row.fields[key], value, confidence: 1, ...(refId !== undefined ? { refId } : {}) } },
    });
  }

  return (
    <div className={cn("rounded-lg border p-3 space-y-3", !row.include && "opacity-50", confidenceClass(row.kind === "calendarEvent" ? 1 : row.nurseMatchConfidence))}>
      <div className="flex items-center gap-2 flex-wrap">
        <Checkbox checked={row.include} onCheckedChange={(v) => onChange({ ...row, include: !!v })} />
        <Badge variant="secondary">{KIND_LABELS[row.kind]}</Badge>
        {actionsForKind(row.kind).length > 1 ? (
          <Select value={row.action} onValueChange={(v) => onChange({ ...row, action: v as "create" | "update" })}>
            <SelectTrigger size="sm" className="h-7 w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="create">Create new</SelectItem>
              <SelectItem value="update">Update existing</SelectItem>
            </SelectContent>
          </Select>
        ) : (
          <Badge variant="outline" className="text-xs">New record</Badge>
        )}
        <div className="flex-1" />
        <Button type="button" variant="ghost" size="sm" onClick={onRemove} aria-label="Remove row">
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>

      {showsNursePicker && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground w-24 shrink-0">Nurse</span>
          <Select
            value={row.nurseId ? String(row.nurseId) : "none"}
            onValueChange={(v) => onChange({ ...row, nurseId: v === "none" ? null : Number(v), nurseMatchConfidence: 1 })}
          >
            <SelectTrigger size="sm" className={cn("h-8 flex-1", confidenceClass(row.nurseMatchConfidence))}>
              <SelectValue placeholder={row.action === "create" && row.kind === "nurse" ? "New nurse (see fields below)" : "Select nurse..."} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{row.kind === "nurse" ? "New nurse (see fields below)" : "— none —"}</SelectItem>
              {nurses.map((n) => (
                <SelectItem key={n.id} value={String(n.id)}>
                  {nurseFullName(n)} ({n.employeeId})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {row.nurseNameGuess && <span className="text-xs text-muted-foreground shrink-0">AI read: "{row.nurseNameGuess}"</span>}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {Object.entries(fieldDefs).map(([key, def]) => {
          const fv = row.fields[key];
          const refKind = REFERENCE_FIELDS[key];
          const cls = cn("h-8", confidenceClass(fv?.confidence ?? 1));

          if (refKind) {
            const list = refKind === "area" ? areas : refKind === "credentialType" ? credentialTypes : trainingCatalog;
            return (
              <div key={key} className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-28 shrink-0">{def.label}</span>
                <Select value={fv?.refId ? String(fv.refId) : "none"} onValueChange={(v) => setField(key, v === "none" ? null : list.find((i) => i.id === Number(v))?.name ?? null, v === "none" ? null : Number(v))}>
                  <SelectTrigger size="sm" className={cn("flex-1", cls)}>
                    <SelectValue placeholder={typeof fv?.value === "string" && fv.value ? `"${fv.value}" (no match)` : "Select..."} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— none —</SelectItem>
                    {list.map((item) => (
                      <SelectItem key={item.id} value={String(item.id)}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            );
          }

          if (def.type === "select" && def.options) {
            return (
              <div key={key} className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-28 shrink-0">{def.label}</span>
                <Select value={typeof fv?.value === "string" ? fv.value : "none"} onValueChange={(v) => setField(key, v === "none" ? null : v)}>
                  <SelectTrigger size="sm" className={cn("flex-1", cls)}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— none —</SelectItem>
                    {def.options.map((opt) => (
                      <SelectItem key={opt} value={opt}>
                        {opt}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            );
          }

          if (def.type === "boolean") {
            return (
              <div key={key} className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-28 shrink-0">{def.label}</span>
                <Checkbox checked={fv?.value === true} onCheckedChange={(v) => setField(key, !!v)} />
              </div>
            );
          }

          return (
            <div key={key} className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground w-28 shrink-0">{def.label}</span>
              <Input
                className={cls}
                type={def.type === "number" ? "number" : def.type === "date" ? "date" : "text"}
                value={fv?.value === null || fv?.value === undefined ? "" : String(fv.value)}
                onChange={(e) => setField(key, def.type === "number" ? (e.target.value === "" ? null : Number(e.target.value)) : e.target.value)}
              />
            </div>
          );
        })}
      </div>

      {row.sourceExcerpt && (
        <div>
          <button type="button" className="text-xs text-muted-foreground underline" onClick={() => setExpanded((v) => !v)}>
            {expanded ? "Hide source text" : "Show source text"}
          </button>
          {expanded && <p className="text-xs bg-muted rounded p-2 mt-1 whitespace-pre-wrap">{row.sourceExcerpt}</p>}
        </div>
      )}
    </div>
  );
}
