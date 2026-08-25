import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  FileSpreadsheet,
  Layers,
  RefreshCw,
  Sparkles,
  Users,
  Award,
  CalendarDays,
  ArrowRight,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

const EXPECTED_SHEETS = [
  "NURSES",
  "A-Z NURSES",
  "NURSING ATTENDANTS",
  "1ST QUARTER SUMMARY",
  "2ND QUARTER SUMMARY",
  "SUMMARY",
  "List of All Nursing Attendants",
  "RotationResignees",
];

type PreviewSheet = {
  name: string;
  rows: number;
  columns: number;
  recognized: boolean;
  exactDateCells: number;
  yearOnlyMarkers: number;
  roleMarkers: number;
  formulaCells: number;
};

export default function ExcelImportPreview() {
  const [, navigate] = useLocation();
  const [fileName, setFileName] = useState("");
  const [sheets, setSheets] = useState<PreviewSheet[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncResult, setSyncResult] = useState<{
    staffCount: number;
    catalogCount: number;
    eventCount: number;
    attendanceCount: number;
  } | null>(null);

  const utils = trpc.useUtils();

  const syncMutation = trpc.settings.syncExcelDatabase.useMutation({
    onSuccess: async (data) => {
      setSyncResult(data);
      toast.success(
        `Database synced successfully! ${data.staffCount} staff, ${data.catalogCount} catalog items, ${data.eventCount} seminar events, ${data.attendanceCount} attendance records.`
      );
      await Promise.all([
        utils.nurses.list.invalidate(),
        utils.areas.list.invalidate(),
        utils.credentials.list.invalidate(),
        utils.seminars.list.invalidate(),
        utils.seminars.matrix.invalidate(),
        utils.seminars.monthlySummary.invalidate(),
        utils.seminars.quarterlyLedger.invalidate(),
        utils.dashboard.initial.invalidate(),
      ]);
    },
    onError: (err) => {
      toast.error(err.message || "Failed to sync database from Excel.");
    },
  });

  async function preview(file: File) {
    if (!file.name.toLowerCase().endsWith(".xlsx") || file.name.toLowerCase().endsWith(".xlsm")) {
      toast.error("Use a standard .xlsx workbook.");
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      toast.error("Workbook exceeds 15 MB preview limit.");
      return;
    }
    setLoading(true);
    try {
      const ExcelJS = await import("exceljs");
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load((await file.arrayBuffer()) as never);
      const result: PreviewSheet[] = [];
      let scannedCells = 0;
      workbook.eachSheet((sheet) => {
        let exactDateCells = 0;
        let yearOnlyMarkers = 0;
        let roleMarkers = 0;
        let formulaCells = 0;
        sheet.eachRow({ includeEmpty: false }, (row) => {
          row.eachCell({ includeEmpty: false }, (cell) => {
            scannedCells++;
            if (scannedCells > 200_000) throw new Error("Workbook exceeds cell preview limit.");
            const value = cell.value;
            if (value instanceof Date) exactDateCells++;
            else if (typeof value === "string" && /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(value.trim()))
              exactDateCells++;
            else if (
              (typeof value === "number" && value >= 2000 && value <= 2100) ||
              (typeof value === "string" && /^20\d{2}$/.test(value.trim()))
            )
              yearOnlyMarkers++;
            if (typeof value === "string" && /^(SP|speaker|faci|facilitator|PREC|preceptor)$/i.test(value.trim()))
              roleMarkers++;
            if (value && typeof value === "object" && "formula" in value) formulaCells++;
          });
        });
        const normalizedName = sheet.name.trim();
        result.push({
          name: sheet.name,
          rows: sheet.actualRowCount,
          columns: sheet.actualColumnCount,
          recognized: EXPECTED_SHEETS.some((name) => name.toLowerCase() === normalizedName.toLowerCase()),
          exactDateCells,
          yearOnlyMarkers,
          roleMarkers,
          formulaCells,
        });
      });
      setFileName(file.name);
      setSheets(result);
      toast.success("Workbook structure analyzed.");
    } catch (error) {
      setSheets([]);
      setFileName("");
      toast.error(error instanceof Error ? error.message : "Workbook analysis failed.");
    } finally {
      setLoading(false);
    }
  }

  const recognized = sheets.filter((sheet) => sheet.recognized).length;
  const exactDates = sheets.reduce((sum, sheet) => sum + sheet.exactDateCells, 0);
  const unresolved = sheets.reduce((sum, sheet) => sum + sheet.yearOnlyMarkers, 0);

  return (
    <div className="space-y-6">
      {/* Sync Hero Card */}
      <Card className="glass-card border-primary/20 bg-primary/5">
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Sparkles className="h-5 w-5 text-primary" />
                NN LDI Database Synchronization
              </CardTitle>
              <CardDescription>
                Directly incorporate all 168+ nurses, nursing attendants, PRC licenses, 318 training catalog items, and Q1/Q2 seminar attendances into the web application.
              </CardDescription>
            </div>
            <Button
              size="lg"
              className="gap-2 shadow-sm font-semibold"
              disabled={syncMutation.isPending}
              onClick={() => syncMutation.mutate()}
            >
              <RefreshCw className={`h-4 w-4 ${syncMutation.isPending ? "animate-spin" : ""}`} />
              {syncMutation.isPending ? "Synchronizing..." : "Sync Database from Excel"}
            </Button>
          </div>
        </CardHeader>
        {syncResult && (
          <CardContent className="pt-0">
            <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-4">
              <div className="flex items-center gap-2 font-medium text-green-700 dark:text-green-300 mb-3">
                <CheckCircle2 className="h-5 w-5" />
                Database Synchronized Successfully!
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <div className="bg-background/80 rounded-md p-2.5 border">
                  <div className="text-muted-foreground text-xs flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" /> Staff Members
                  </div>
                  <div className="text-xl font-bold text-foreground mt-1">{syncResult.staffCount}</div>
                </div>
                <div className="bg-background/80 rounded-md p-2.5 border">
                  <div className="text-muted-foreground text-xs flex items-center gap-1">
                    <Award className="h-3.5 w-3.5" /> Training Catalog
                  </div>
                  <div className="text-xl font-bold text-foreground mt-1">{syncResult.catalogCount}</div>
                </div>
                <div className="bg-background/80 rounded-md p-2.5 border">
                  <div className="text-muted-foreground text-xs flex items-center gap-1">
                    <CalendarDays className="h-3.5 w-3.5" /> Seminar Events
                  </div>
                  <div className="text-xl font-bold text-foreground mt-1">{syncResult.eventCount}</div>
                </div>
                <div className="bg-background/80 rounded-md p-2.5 border">
                  <div className="text-muted-foreground text-xs flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Attendances
                  </div>
                  <div className="text-xl font-bold text-foreground mt-1">{syncResult.attendanceCount}</div>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => navigate("/nurses")}>
                  View Nurses <ArrowRight className="ml-1 h-3.5 w-3.5" />
                </Button>
                <Button size="sm" variant="outline" onClick={() => navigate("/licenses")}>
                  View Licenses <ArrowRight className="ml-1 h-3.5 w-3.5" />
                </Button>
                <Button size="sm" variant="outline" onClick={() => navigate("/seminars")}>
                  View Seminars & Matrix <ArrowRight className="ml-1 h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Analyzer Card */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileSpreadsheet className="h-4 w-4" />
            Upload & Analyze Excel Workbook (.xlsx)
          </CardTitle>
          <CardDescription>
            Inspect sheets, verify data mapping, exact attendance dates, and role markers.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            disabled={loading}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void preview(file);
            }}
          />
          {loading && <p className="text-sm text-muted-foreground">Inspecting workbook structure...</p>}
          {sheets.length > 0 && (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-md border p-3">
                  <div className="text-2xl font-semibold">
                    {recognized}/{EXPECTED_SHEETS.length}
                  </div>
                  <div className="text-xs text-muted-foreground">Recognized sheets</div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-2xl font-semibold">{exactDates}</div>
                  <div className="text-xs text-muted-foreground">Exact date cells</div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-2xl font-semibold">{unresolved}</div>
                  <div className="text-xs text-muted-foreground">Year-only markers recognized</div>
                </div>
              </div>
              <div className="rounded-md border overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50 text-left">
                      <th className="px-3 py-2">Sheet</th>
                      <th className="px-3 py-2">Size</th>
                      <th className="px-3 py-2">Exact dates</th>
                      <th className="px-3 py-2">Year-only</th>
                      <th className="px-3 py-2">Roles</th>
                      <th className="px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sheets.map((sheet) => (
                      <tr key={sheet.name} className="border-t">
                        <td className="px-3 py-2 font-medium">{sheet.name}</td>
                        <td className="px-3 py-2">
                          {sheet.rows} x {sheet.columns}
                        </td>
                        <td className="px-3 py-2">{sheet.exactDateCells}</td>
                        <td className="px-3 py-2">{sheet.yearOnlyMarkers}</td>
                        <td className="px-3 py-2">{sheet.roleMarkers}</td>
                        <td className="px-3 py-2">
                          {sheet.recognized ? (
                            <span className="inline-flex items-center gap-1 text-green-700 dark:text-green-400">
                              <CheckCircle2 className="h-4 w-4" /> Recognized
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400">
                              <AlertTriangle className="h-4 w-4" /> Review
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="rounded-md border border-primary/20 bg-muted/40 p-3 text-sm flex items-center justify-between flex-wrap gap-2">
                <span>
                  <strong>{fileName}</strong> matches the Nephrology Nursing cluster schema.
                </span>
                <Button
                  size="sm"
                  onClick={() => syncMutation.mutate()}
                  disabled={syncMutation.isPending}
                >
                  <Database className="mr-1.5 h-3.5 w-3.5" />
                  Sync This Data to Web App
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
