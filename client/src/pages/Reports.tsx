import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { BarChart3, Download, FileSpreadsheet, Printer } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

type ReportType = "licenseStatus" | "licenseDue" | "trainingCompliance" | "areaExposure" | "trainingSummary" | "transferLog";

const COLUMNS: Partial<Record<ReportType, { key: string; label: string }[]>> = {
  licenseStatus: [
    { key: "nurse", label: "Nurse" },
    { key: "employeeId", label: "Employee ID" },
    { key: "areaName", label: "Area" },
    { key: "credentialType", label: "Credential" },
    { key: "licenseNumber", label: "License #" },
    { key: "issuingOrganization", label: "Issuer" },
    { key: "issueDate", label: "Issued" },
    { key: "expiryDate", label: "Expires" },
    { key: "daysRemaining", label: "Days Left" },
    { key: "status", label: "Status" },
    { key: "renewalStatus", label: "Renewal" },
    { key: "verificationStatus", label: "Verified" },
  ],
  licenseDue: [
    { key: "nurse", label: "Nurse" },
    { key: "employeeId", label: "Employee ID" },
    { key: "areaName", label: "Area" },
    { key: "credentialType", label: "Credential" },
    { key: "licenseNumber", label: "License #" },
    { key: "issuingOrganization", label: "Issuer" },
    { key: "expiryDate", label: "Expires" },
    { key: "daysRemaining", label: "Days Left" },
    { key: "status", label: "Status" },
    { key: "renewalStatus", label: "Renewal" },
  ],
  trainingCompliance: [
    { key: "areaName", label: "Area" },
    { key: "requiredTrainings", label: "Required Trainings" },
    { key: "staffCount", label: "Staff" },
    { key: "requiredChecks", label: "Required Checks" },
    { key: "compliantChecks", label: "Compliant" },
    { key: "compliancePercent", label: "Compliance %" },
  ],
  areaExposure: [
    { key: "nurse", label: "Nurse" },
    { key: "employeeId", label: "License Number" },
    { key: "areaName", label: "Area" },
    { key: "startDate", label: "Start" },
    { key: "endDate", label: "End" },
    { key: "assignmentType", label: "Type" },
    { key: "durationDays", label: "Days" },
  ],
  trainingSummary: [
    { key: "nurse", label: "Nurse" },
    { key: "trainingName", label: "Training" },
    { key: "category", label: "Category" },
    { key: "renewalRequired", label: "Renewable" },
    { key: "status", label: "Status" },
    { key: "scheduledDate", label: "Scheduled" },
    { key: "completionDate", label: "Completed" },
    { key: "expiryDate", label: "Expires" },
    { key: "trainingHours", label: "Hours" },
    { key: "cpdUnits", label: "CPD" },
    { key: "provider", label: "Provider" },
  ],
  transferLog: [
    { key: "nurse", label: "Nurse" },
    { key: "employeeId", label: "License Number" },
    { key: "areaName", label: "Area" },
    { key: "startDate", label: "Start" },
    { key: "endDate", label: "End" },
    { key: "assignmentType", label: "Type" },
    { key: "remarks", label: "Remarks" },
  ],
};

export default function Reports() {
  const [, navigate] = useLocation();
  const [activeType, setActiveType] = useState<ReportType | null>(null);
  const { data: catalog, isLoading } = trpc.reports.list.useQuery();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
          <p className="text-sm text-muted-foreground">
            Generate compliance, renewal, exposure, and transfer reports. Export as CSV.
          </p>
        </div>
      </div>

      {!activeType ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {isLoading ? (
            Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-32" />)
          ) : (
            (catalog ?? []).map((r) => (
              <Card
                key={r.type}
                className="cursor-pointer hover:border-primary transition-colors"
                onClick={() => setActiveType(r.type)}
              >
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <BarChart3 className="h-4 w-4" />
                    {r.label}
                  </CardTitle>
                  <CardDescription className="text-xs">{r.description}</CardDescription>
                </CardHeader>
                <CardContent className="pt-0 text-xs text-muted-foreground">
                  {r.rowHint !== null ? `${r.rowHint} rows expected` : "On-demand"}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      ) : (
        <ReportView type={activeType} onBack={() => setActiveType(null)} />
      )}
    </div>
  );
}

function ReportView({ type, onBack }: { type: ReportType; onBack: () => void }) {
  const { data: rows, isLoading } = trpc.reports.generate.useQuery({ type });
  const cols = COLUMNS[type];
  const report = (rows ?? []) as Record<string, unknown>[];

  const downloadCsv = () => {
    if (!cols || !report.length) return;
    const lines = [cols.map((c) => `"${c.label}"`).join(",")];
    for (const r of report) {
      lines.push(
        cols
          .map((c) => {
            let v = r[c.key];
            if (v === null || v === undefined) v = "";
            if (typeof v === "number" && type === "trainingCompliance" && c.key === "compliancePct") v = String(v);
            return `"${String(v).replace(/"/g, '""')}"`;
          })
          .join(","),
      );
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${type}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV downloaded.");
  };

  return (
    <Card className="glass-card">
      <CardContent className="pt-5 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={onBack}>← All Reports</Button>
          <Button variant="outline" size="sm" onClick={() => window.print()} disabled={!report.length}>
            <Printer className="h-4 w-4 mr-1" />
            Print
          </Button>
          <Button size="sm" onClick={downloadCsv} disabled={!report.length}>
            <FileSpreadsheet className="h-4 w-4 mr-1" />
            Export CSV
          </Button>
        </div>
        {isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : !cols || report.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-10">No data for this report yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left">
                  {cols.map((c) => (
                    <th key={c.key} className="px-3 py-2.5 font-medium whitespace-nowrap">{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {report.map((r, i) => (
                  <tr key={i}>
                    {cols.map((c) => (
                      <td key={c.key} className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                        {c.key === "nurse" && r.nurseId ? (
                          <a href={`/nurses/${r.nurseId}`} className="font-medium text-primary hover:underline">
                            {String(r.nurse ?? "")}
                          </a>
                        ) : c.key === "nurse" ? (
                          String(r.nurse ?? "")
                        ) : c.key === "renewalRequired" ? (
                          r[c.key] ? "Yes" : "No"
                        ) : String(r[c.key] ?? "—")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
