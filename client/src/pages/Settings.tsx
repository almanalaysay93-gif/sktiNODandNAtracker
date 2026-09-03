import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { Bell, Download, FileSpreadsheet, Play, RefreshCw, Save, Upload } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export default function SettingsPage() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.settings.getAll.useQuery();
  const update = trpc.settings.update.useMutation({
    onSuccess: () => {
      toast.success("Settings saved.");
      utils.settings.getAll.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const [appTitle, setAppTitle] = useState("");
  const [orgName, setOrgName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [thresholds, setThresholds] = useState("");

  useEffect(() => {
    if (data) {
      setAppTitle(String(data.appTitle ?? ""));
      setOrgName(String(data.orgName ?? ""));
      setContactEmail(String(data.contactEmail ?? ""));
      setThresholds(String(data.reminderThresholdDays ?? ""));
    }
  }, [data]);

  const save = () => {
    update.mutate({ key: "appTitle", value: appTitle.trim() || null });
    update.mutate({ key: "orgName", value: orgName.trim() || null });
    update.mutate({ key: "contactEmail", value: contactEmail.trim() || null });
    update.mutate({ key: "reminderThresholdDays", value: thresholds.trim() });
  };

  if (isLoading) return <Skeleton className="h-96 w-full" />;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Organization profile, reminder thresholds, nurse import, and data export.
        </p>
      </div>

      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="reminders">Reminders</TabsTrigger>
          <TabsTrigger value="import">CSV Import</TabsTrigger>
          <TabsTrigger value="export">Export</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="mt-4">
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-base">Organization Profile</CardTitle>
              <CardDescription>Used in report headers and reminders.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 max-w-md">
              <div>
                <Label className="mb-1 block">App Title</Label>
                <Input value={appTitle} onChange={(e) => setAppTitle(e.target.value)} />
              </div>
              <div>
                <Label className="mb-1 block">Organization Name</Label>
                <Input value={orgName} onChange={(e) => setOrgName(e.target.value)} />
              </div>
              <div>
                <Label className="mb-1 block">Contact Email</Label>
                <Input value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
              </div>
              <Button onClick={save} disabled={update.isPending} className="w-fit">
                <Save className="h-4 w-4 mr-1" />
                Save
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reminders" className="mt-4">
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Bell className="h-4 w-4" />
                Renewal Reminders
              </CardTitle>
              <CardDescription>
                The daily job notifies you about licenses expiring within these thresholds (days).
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 max-w-md">
              <div>
                <Label className="mb-1 block">Thresholds (comma-separated, e.g. 365,180)</Label>
                <Input value={thresholds} onChange={(e) => setThresholds(e.target.value)} />
              </div>
              <div className="flex gap-2">
                <Button onClick={save} disabled={update.isPending} className="w-fit">
                  <Save className="h-4 w-4 mr-1" />
                  Save
                </Button>
                <RunRemindersNow />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="import" className="mt-4">
          <ImportTab />
        </TabsContent>

        <TabsContent value="export" className="mt-4">
          <ExportTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function RunRemindersNow() {
  const utils = trpc.useUtils();
  const run = trpc.settings.runRemindersNow.useMutation({
    onSuccess: (res) => {
      const created = Array.isArray(res) ? res.length : 0;
      toast.success(`Reminder check complete. ${created} new notification(s) created.`);
      utils.notifications.list.invalidate();
      utils.notifications.unreadCount.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Button variant="outline" disabled={run.isPending} onClick={() => run.mutate()}>
      <Play className="h-4 w-4 mr-1" />
      {run.isPending ? "Running…" : "Run Reminder Check Now"}
    </Button>
  );
}

function ImportTab() {
  const utils = trpc.useUtils();
  const [csv, setCsv] = useState("");
  const preview = trpc.settings.previewCsvImport.useMutation();
  const execute = trpc.settings.executeCsvImport.useMutation({
    onSuccess: (res) => {
      toast.success(`Imported ${res.imported} nurse(s); skipped ${res.skipped}.`);
      utils.nurses.list.invalidate();
      utils.areas.list.invalidate();
      setCsv("");
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Upload className="h-4 w-4" />
          Bulk Nurse Import
        </CardTitle>
        <CardDescription>
          Paste CSV with columns: employeeId, firstName, middleName, lastName, suffix, position, dateHired (YYYY-MM-DD), currentArea.
          The area name must match an existing active area.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <Textarea
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          placeholder={"employeeId,firstName,middleName,lastName,suffix,position,dateHired,currentArea\nN-0010,Juan,Dela,Cruz,,RN,2024-06-01,ER"}
          className="min-h-32 font-mono text-xs"
        />
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            disabled={preview.isPending || !csv.trim()}
            onClick={() => preview.mutate({ csv: csv.trim() })}
          >
            Preview
          </Button>
          <Button
            disabled={execute.isPending || !preview.data || preview.data.validRows === 0}
            onClick={() => execute.mutate({ csv: csv.trim() })}
          >
            {execute.isPending ? "Importing…" : "Import Valid Rows"}
          </Button>
        </div>
        {preview.data && (
          <div className="text-sm space-y-1">
            <p>
              <strong>Rows:</strong> {preview.data.totalRows} total · {preview.data.validRows} valid
            </p>
            {preview.data.issues.length > 0 && (
              <div>
                <p className="font-medium text-red-600">Issues (first {preview.data.issues.length}):</p>
                <ul className="list-disc pl-5 text-xs text-red-600">
                  {preview.data.issues.map((issue, i) => (
                    <li key={i}>{issue}</li>
                  ))}
                </ul>
              </div>
            )}
            {preview.data.preview.length > 0 && (
              <div className="overflow-x-auto border rounded">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/50 text-left">
                      <th className="px-2 py-1">Row</th>
                      <th className="px-2 py-1">Employee ID</th>
                      <th className="px-2 py-1">Name</th>
                      <th className="px-2 py-1">Status</th>
                      <th className="px-2 py-1">Note</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {preview.data.preview.map((p) => (
                      <tr key={p.row}>
                        <td className="px-2 py-1">{p.row}</td>
                        <td className="px-2 py-1">{p.employeeId}</td>
                        <td className="px-2 py-1">{p.name}</td>
                        <td className="px-2 py-1">{p.valid ? "Valid" : "Invalid"}</td>
                        <td className="px-2 py-1 text-muted-foreground">{p.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ExportTab() {
  const utils = trpc.useUtils();
  const entities = [
    { value: "nurses", label: "Nurses" },
    { value: "credentials", label: "Licenses & Credentials" },
    { value: "trainings", label: "Trainings" },
    { value: "assignments", label: "Area Assignments" },
    { value: "all", label: "All (JSON backup)" },
  ] as const;

  const dedup = trpc.settings.deduplicateDatabase.useMutation({
    onSuccess: (res) => {
      toast.success(`Cleaned duplicates: merged ${res.mergedNursesGroups} nurse groups, removed ${res.deletedDuplicateNurses} duplicate profiles, ${res.deduplicatedTrainings} duplicate trainings.`);
      utils.nurses.list.invalidate();
      utils.trainings.listRecords.invalidate();
      utils.credentials.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <div className="space-y-4">
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Download className="h-4 w-4" />
            Data Export
          </CardTitle>
          <CardDescription>Download raw data for records or backup purposes.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {entities.map((e) => (
            <ExportButton key={e.value} entity={e.value} label={e.label} />
          ))}
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <RefreshCw className="h-4 w-4" />
            Database Maintenance & Deduplication
          </CardTitle>
          <CardDescription>
            Merge duplicate staff profiles (matching by normalized name/license), merge their assignments, credentials, and training records, and clean duplicate training completions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            disabled={dedup.isPending}
            onClick={() => dedup.mutate()}
          >
            {dedup.isPending ? "Deduplicating..." : "Run Database Deduplication"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function ExportButton({ entity, label }: { entity: string; label: string }) {
  const { data, isPending } = trpc.settings.exportData.useQuery({ entity: entity as "nurses" });
  const download = () => {
    if (!data || Object.keys(data).length === 0) {
      toast.error(`No records found to export for ${label}.`);
      return;
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nursetrack-${entity}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${label} exported.`);
  };
  return (
    <Button variant="outline" disabled={isPending} onClick={download}>
      <FileSpreadsheet className="h-4 w-4 mr-1" />
      {label}
    </Button>
  );
}
