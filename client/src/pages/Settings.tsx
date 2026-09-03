import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { Bell, Download, FileSpreadsheet, Play, RefreshCw, Save, Upload, Mail, Send, CheckCircle2, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
          <TabsTrigger value="email">Email Automation</TabsTrigger>
          <TabsTrigger value="import">CSV Import</TabsTrigger>
          <TabsTrigger value="export">Export</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="mt-4">
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-base">Organization & Branding</CardTitle>
              <CardDescription>
                Customize how SKTI NurseTrack appears to users across the department.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 max-w-md">
              <div>
                <Label className="mb-1 block">Application Title</Label>
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

        <TabsContent value="email" className="mt-4">
          <EmailAutomationTab />
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

function EmailAutomationTab() {
  const utils = trpc.useUtils();
  const { data: status, isLoading: statusLoading } = trpc.settings.emailStatus.useQuery();
  const { data: logs, isLoading: logsLoading } = trpc.settings.listEmailLogs.useQuery({ limit: 50 });
  const [testEmail, setTestEmail] = useState("");

  const sendTest = trpc.settings.sendTestEmail.useMutation({
    onSuccess: (res) => {
      if (res.status === "mock_sent") {
        toast.success("Test email processed in mock mode (logged to server console).");
      } else if (res.status === "sent") {
        toast.success("Test email dispatched via Resend!");
      } else {
        toast.error(`Email dispatch failed: ${res.error}`);
      }
      utils.settings.listEmailLogs.invalidate();
      setTestEmail("");
    },
    onError: (e) => toast.error(e.message),
  });

  const triggerPass = trpc.settings.triggerEmailPassNow.useMutation({
    onSuccess: (res) => {
      toast.success(
        `Email pass complete: ${res.expiry.sent} expiry alert(s) sent (${res.expiry.skipped} skipped), ${res.seminars.sent} seminar reminder(s) sent.`
      );
      utils.settings.listEmailLogs.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Mail className="h-4 w-4" />
              Email Service Status
            </CardTitle>
            <CardDescription>
              Service provider status and outbound notification settings.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Provider:</span>
              <span className="text-sm">Resend (REST API)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Status:</span>
              {statusLoading ? (
                <Skeleton className="h-5 w-24" />
              ) : status?.configured ? (
                <Badge className="bg-green-600 text-white flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Configured & Live
                </Badge>
              ) : (
                <Badge variant="outline" className="text-amber-600 border-amber-300 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" /> Mock Mode (Log Only)
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Sender:</span>
              <span className="font-mono">{status?.fromAddress ?? "notifications@sktinursetrack.com"}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              To activate live delivery to staff mailboxes, add <code>RESEND_API_KEY</code> to your environment variables on Railway.
            </p>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Send className="h-4 w-4" />
              Test & Manual Triggers
            </CardTitle>
            <CardDescription>
              Verify deliverability or manually trigger the daily digest check now.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs">Send Test Email</Label>
              <div className="flex gap-2">
                <Input
                  type="email"
                  placeholder="name@spmc.gov.ph"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                />
                <Button
                  size="sm"
                  disabled={!testEmail.trim() || sendTest.isPending}
                  onClick={() => sendTest.mutate({ targetEmail: testEmail.trim() })}
                >
                  {sendTest.isPending ? "Sending…" : "Send Test"}
                </Button>
              </div>
            </div>
            <div className="pt-2 border-t">
              <Label className="text-xs mb-1.5 block">Run Automated Pass Manually</Label>
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                disabled={triggerPass.isPending}
                onClick={() => triggerPass.mutate()}
              >
                <Play className="h-4 w-4 mr-1" />
                {triggerPass.isPending ? "Running Pass…" : "Run Daily Digest Pass Now"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="glass-card">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Outbound Email Audit Ledger</CardTitle>
            <CardDescription>Recent notification attempts, delivery status, and timestamps.</CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={() => utils.settings.listEmailLogs.invalidate()}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Refresh
          </Button>
        </CardHeader>
        <CardContent>
          {logsLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : !logs || logs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No email notifications dispatched yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/40 text-left">
                    <th className="px-3 py-2 font-medium">Timestamp</th>
                    <th className="px-3 py-2 font-medium">Recipient</th>
                    <th className="px-3 py-2 font-medium">Type</th>
                    <th className="px-3 py-2 font-medium">Subject</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {logs.map((l) => (
                    <tr key={l.id}>
                      <td className="px-3 py-2 text-muted-foreground">{String(l.sentAt).slice(0, 19).replace("T", " ")}</td>
                      <td className="px-3 py-2 font-mono">{l.recipientEmail}</td>
                      <td className="px-3 py-2">{l.emailType.replace("_", " ")}</td>
                      <td className="px-3 py-2 max-w-xs truncate" title={l.subject}>{l.subject}</td>
                      <td className="px-3 py-2">
                        <Badge
                          variant="outline"
                          className={
                            l.status === "sent"
                              ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300"
                              : l.status === "mock_sent"
                              ? "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                              : "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                          }
                        >
                          {l.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
