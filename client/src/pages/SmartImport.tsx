import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { toast } from "sonner";
import { Sparkles, Upload } from "lucide-react";
import { pickFile } from "@/components/nursetrack/FileUpload";
import { SmartImportRowCard } from "@/components/nursetrack/SmartImportRowCard";
import type { SmartImportRow } from "../../../shared/smartImport";

export default function SmartImportPage() {
  const [fileName, setFileName] = useState<string | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [rows, setRows] = useState<SmartImportRow[]>([]);

  const { data: nursesData } = trpc.nurses.list.useQuery(undefined, { enabled: !!draftId });
  const { data: areasData } = trpc.areas.list.useQuery(undefined, { enabled: !!draftId });
  const { data: credentialTypes } = trpc.credentials.listTypes.useQuery(undefined, { enabled: !!draftId });
  const { data: trainingCatalog } = trpc.trainings.listCatalog.useQuery(undefined, { enabled: !!draftId });

  const analyze = trpc.smartImport.analyze.useMutation({
    onSuccess: (data) => {
      setDraftId(data.draftId);
      setFileName(data.fileName);
      setRows(data.rows as SmartImportRow[]);
      if (data.rows.length === 0) toast.warning("No records were recognized in this file.");
    },
    onError: (err) => toast.error(err.message),
  });

  const utils = trpc.useUtils();
  const commit = trpc.smartImport.commit.useMutation({
    onSuccess: (result) => {
      const parts = [result.created ? `${result.created} created` : null, result.updated ? `${result.updated} updated` : null, result.skipped ? `${result.skipped} skipped` : null];
      toast.success(`Import complete: ${parts.filter(Boolean).join(", ") || "nothing written"}.`);
      for (const err of result.errors) toast.error(err, { duration: 8000 });
      setDraftId(null);
      setFileName(null);
      setRows([]);
      utils.nurses.invalidate();
      utils.credentials.invalidate();
      utils.trainings.invalidate();
      utils.calendar.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  async function handleUpload() {
    const file = await pickFile("smartImport");
    if (!file) return;
    analyze.mutate(file);
  }

  function updateRow(rowId: string, next: SmartImportRow) {
    setRows((prev) => prev.map((r) => (r.rowId === rowId ? next : r)));
  }
  function removeRow(rowId: string) {
    setRows((prev) => prev.filter((r) => r.rowId !== rowId));
  }

  const includedCount = rows.filter((r) => r.include).length;

  return (
    <div className="space-y-4 max-w-5xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" /> Smart Import
          </CardTitle>
          <CardDescription>
            Upload a license, certificate, roster spreadsheet, or schedule of any type. AI reads it and drafts nurse, license, training, area
            assignment, or calendar records for you to check and correct — nothing is saved until you confirm below.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button type="button" onClick={handleUpload} disabled={analyze.isPending}>
            {analyze.isPending ? <Spinner className="h-4 w-4 mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
            {analyze.isPending ? "Reading file with AI…" : "Upload File"}
          </Button>
          {fileName && <span className="ml-3 text-sm text-muted-foreground">{fileName}</span>}
        </CardContent>
      </Card>

      {draftId && (
        <Card>
          <CardHeader>
            <CardTitle>Review Extracted Records ({rows.length})</CardTitle>
            <CardDescription>Check each row against the source text, correct anything the AI got wrong, and uncheck rows you don't want imported.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {rows.length === 0 && <p className="text-sm text-muted-foreground">Nothing to review — no records were found.</p>}
            {rows.map((row) => (
              <SmartImportRowCard
                key={row.rowId}
                row={row}
                nurses={nursesData ?? []}
                areas={areasData ?? []}
                credentialTypes={credentialTypes ?? []}
                trainingCatalog={trainingCatalog ?? []}
                onChange={(next) => updateRow(row.rowId, next)}
                onRemove={() => removeRow(row.rowId)}
              />
            ))}

            {rows.length > 0 && (
              <div className="flex items-center gap-3 pt-2 border-t">
                <span className="text-sm text-muted-foreground">{includedCount} row{includedCount === 1 ? "" : "s"} selected</span>
                <Button
                  type="button"
                  disabled={commit.isPending || includedCount === 0}
                  onClick={() => commit.mutate({ draftId, rows })}
                >
                  {commit.isPending ? <Spinner className="h-4 w-4 mr-2" /> : null}
                  Confirm & Update Database
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

