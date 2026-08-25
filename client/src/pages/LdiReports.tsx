import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { Download } from "lucide-react";
import { useState } from "react";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function downloadCsv(name: string, headers: string[], rows: (string | number)[][]) {
  const safe = (value: string | number) => {
    let text = String(value ?? "");
    if (/^[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };
  const content = [headers, ...rows].map((row) => row.map(safe).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function LdiReports() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [quarter, setQuarter] = useState(1);
  const monthly = trpc.seminars.monthlySummary.useQuery({ year });
  const quarterly = trpc.seminars.quarterlyLedger.useQuery({ year, quarter });

  return (
    <Tabs defaultValue="monthly" className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <TabsList>
          <TabsTrigger value="monthly">Monthly Summary</TabsTrigger>
          <TabsTrigger value="quarterly">Quarterly Ledger</TabsTrigger>
        </TabsList>
        <Input className="w-28" type="number" min={2000} max={2100} value={year} onChange={(event) => setYear(Number(event.target.value))} />
      </div>

      <TabsContent value="monthly">
        <Card className="glass-card">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">Monthly LDI Summary {year}</CardTitle>
            <Button size="sm" variant="outline" disabled={!monthly.data?.length} onClick={() => downloadCsv(
              `monthly-ldi-${year}.csv`,
              ["Staff", ...MONTHS, "H1", "H2"],
              (monthly.data ?? []).map((row) => [row.staffName, ...row.months, row.h1, row.h2]),
            )}><Download className="mr-1 h-4 w-4" />CSV</Button>
          </CardHeader>
          <CardContent>
            {monthly.isLoading ? <Skeleton className="h-64" /> : (
              <div className="overflow-auto rounded-md border">
                <table className="min-w-max text-sm">
                  <thead><tr className="bg-muted/50"><th className="px-3 py-2 text-left">Staff</th>{MONTHS.map((month) => <th key={month} className="px-3 py-2">{month}</th>)}<th className="px-3 py-2">H1</th><th className="px-3 py-2">H2</th></tr></thead>
                  <tbody>{monthly.data?.map((row) => <tr key={row.nurseId} className="border-t"><td className="px-3 py-2 font-medium">{row.staffName}</td>{row.months.map((count, index) => <td key={index} className="px-3 py-2 text-center">{count}</td>)}<td className="px-3 py-2 text-center font-medium">{row.h1}</td><td className="px-3 py-2 text-center font-medium">{row.h2}</td></tr>)}</tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="quarterly">
        <Card className="glass-card">
          <CardHeader className="flex-row items-center justify-between gap-2">
            <div className="flex items-center gap-2"><CardTitle className="text-base">Quarterly Attendance</CardTitle><Select value={String(quarter)} onValueChange={(value) => setQuarter(Number(value))}><SelectTrigger className="w-24"><SelectValue /></SelectTrigger><SelectContent>{[1, 2, 3, 4].map((q) => <SelectItem key={q} value={String(q)}>Q{q}</SelectItem>)}</SelectContent></Select></div>
            <Button size="sm" variant="outline" disabled={!quarterly.data?.length} onClick={() => downloadCsv(
              `q${quarter}-ldi-${year}.csv`,
              ["Staff", "Seminar/LDI", "Type", "Provider", "Venue", "Start Date", "End Date", "Completion Date", "Role"],
              (quarterly.data ?? []).map((row) => [row.staffName, row.trainingName, row.kind, row.provider ?? "", row.venue ?? "", row.startDate, row.endDate, row.completionDate, row.participationRole]),
            )}><Download className="mr-1 h-4 w-4" />CSV</Button>
          </CardHeader>
          <CardContent>
            {quarterly.isLoading ? <Skeleton className="h-64" /> : !quarterly.data?.length ? <p className="py-10 text-center text-sm text-muted-foreground">No completed attendance in this quarter.</p> : (
              <div className="overflow-auto rounded-md border"><table className="min-w-full text-sm"><thead><tr className="bg-muted/50 text-left"><th className="px-3 py-2">Staff</th><th className="px-3 py-2">Seminar/LDI</th><th className="px-3 py-2">Full Date</th><th className="px-3 py-2">Role</th><th className="px-3 py-2">Provider</th></tr></thead><tbody>{quarterly.data.map((row) => <tr key={row.recordId} className="border-t"><td className="px-3 py-2 font-medium">{row.staffName}</td><td className="px-3 py-2">{row.trainingName}</td><td className="px-3 py-2">{row.startDate === row.endDate ? row.startDate : `${row.startDate} to ${row.endDate}`}</td><td className="px-3 py-2">{row.participationRole}</td><td className="px-3 py-2">{row.provider ?? "-"}</td></tr>)}</tbody></table></div>
            )}
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
