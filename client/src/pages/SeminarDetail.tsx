import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { dateKey, formatDate, PARTICIPATION_ROLES, TRAINING_STATUSES } from "../../../shared/nursetrack";
import { ArrowLeft, Download, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Link, useLocation, useRoute } from "wouter";

function csvCell(value: unknown) {
  let text = String(value ?? "");
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export default function SeminarDetail() {
  const [, params] = useRoute("/seminars/:id");
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const eventId = Number(params?.id);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const { data, isLoading, error } = trpc.seminars.detail.useQuery({ eventId }, { enabled: Number.isFinite(eventId) });
  const remove = trpc.seminars.deleteEvent.useMutation({
    onSuccess: async ({ attendanceDeleted }) => {
      toast.success(`Seminar deleted. ${attendanceDeleted} attendance record(s) removed.`);
      await Promise.all([
        utils.seminars.list.invalidate(),
        utils.seminars.detail.invalidate(),
        utils.seminars.matrix.invalidate(),
        utils.seminars.monthlySummary.invalidate(),
        utils.seminars.quarterlyLedger.invalidate(),
        utils.trainings.initial.invalidate(),
        utils.trainings.listRecords.invalidate(),
        utils.trainings.listForNurse.invalidate(),
        utils.trainings.getCompliance.invalidate(),
        utils.calendar.listEvents.invalidate(),
        utils.dashboard.initial.invalidate(),
      ]);
      setDeleteConfirmOpen(false);
      navigate("/seminars");
    },
    onError: (mutationError) => toast.error(mutationError.message),
  });
  const attendees = useMemo(() => (data?.attendees ?? []).filter((row) => {
    const matchesSearch = row.staffName.toLowerCase().includes(search.toLowerCase()) || row.areaName.toLowerCase().includes(search.toLowerCase());
    return matchesSearch && (status === "all" || row.status === status);
  }), [data, search, status]);
  const allAttendees = useMemo(() => (data?.allAttendees ?? []).filter((row) => {
    const matchesSearch = row.staffName.toLowerCase().includes(search.toLowerCase()) || row.areaName.toLowerCase().includes(search.toLowerCase());
    return matchesSearch && (status === "all" || row.status === status);
  }), [data, search, status]);

  const exportRows = (missing = false) => {
    const headers = missing ? ["Staff", "Staff Type", "Area", "Status"] : ["Staff", "Staff Type", "Area", "Status", "Full Completion Date", "Role", "Hours", "CPD"];
    const rows = missing
      ? (data?.missing ?? []).map((row) => [row.staffName, row.staffType, row.areaName, "Missing"])
      : attendees.map((row) => [row.staffName, row.staffType, row.areaName, row.status, formatDate(row.completionDate), row.participationRole, row.trainingHours ?? "", row.cpdUnits ?? ""]);
    const content = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${missing ? "missing" : "attendees"}-${eventId}.csv`; anchor.click(); URL.revokeObjectURL(url);
  };

  if (isLoading) return <Skeleton className="h-96 w-full" />;
  if (error || !data) {
    return (
      <div className="space-y-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            if (window.history.length > 1) {
              window.history.back();
            } else {
              navigate("/seminars");
            }
          }}
        >
          <ArrowLeft className="mr-1 h-4 w-4" />Back
        </Button>
        <Card><CardContent className="py-12 text-center text-sm text-destructive">{error?.message ?? "Seminar not found."}</CardContent></Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          if (window.history.length > 1) {
            window.history.back();
          } else {
            navigate("/seminars");
          }
        }}
      >
        <ArrowLeft className="mr-1 h-4 w-4" />Back
      </Button>
      <Card className="glass-card">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-medium uppercase text-primary">{data.training.kind}</div>
              <CardTitle>{data.training.name}</CardTitle>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setDeleteConfirmOpen(true)}
            >
              <Trash2 className="mr-1 h-4 w-4" />Delete Seminar
            </Button>
          </div>
          <div className="grid gap-1 text-sm text-muted-foreground sm:grid-cols-2">
            <span>Date: {formatDate(data.event.startDate)}{String(data.event.endDate) !== String(data.event.startDate) ? ` to ${formatDate(data.event.endDate)}` : ""}</span>
            <span>Time: {data.event.startTime || "Not set"}{data.event.endTime ? ` to ${data.event.endTime}` : ""}</span>
            <span>Provider: {data.event.provider || "Not set"}</span>
            <span>Venue: {data.event.venue || "Not set"}</span>
          </div>
        </CardHeader>
      </Card>

      <Tabs defaultValue="attendees" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TabsList><TabsTrigger value="attendees">This occurrence ({data.attendees.length})</TabsTrigger><TabsTrigger value="all">All occurrences ({data.allAttendees.length})</TabsTrigger><TabsTrigger value="missing">Missing ({data.missing.length})</TabsTrigger></TabsList>
          <Button onClick={() => setDialogOpen(true)}><Plus className="mr-1 h-4 w-4" />Add Attendance</Button>
        </div>
        <TabsContent value="attendees">
          <Card className="glass-card"><CardContent className="space-y-3 pt-5">
            <div className="flex flex-wrap gap-2"><Input className="max-w-sm" placeholder="Search staff or area" value={search} onChange={(event) => setSearch(event.target.value)} /><Select value={status} onValueChange={setStatus}><SelectTrigger className="w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem>{TRAINING_STATUSES.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select><Button variant="outline" onClick={() => exportRows(false)} disabled={!attendees.length}><Download className="mr-1 h-4 w-4" />CSV</Button></div>
            <div className="overflow-auto rounded-md border"><table className="min-w-full text-sm"><thead><tr className="bg-muted/50 text-left"><th className="px-3 py-2">Staff</th><th className="px-3 py-2">Area</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Full Date</th><th className="px-3 py-2">Role</th><th className="px-3 py-2">Hours / CPD</th></tr></thead><tbody>{attendees.map((row) => <tr key={row.id} className="border-t"><td className="px-3 py-2"><Link href={`/nurses/${row.nurseId}`} className="font-medium text-primary hover:underline">{row.staffName}</Link><div className="text-xs text-muted-foreground">{row.staffType}</div></td><td className="px-3 py-2">{row.areaName}</td><td className="px-3 py-2">{row.status}</td><td className="px-3 py-2">{formatDate(row.completionDate)}</td><td className="px-3 py-2">{row.participationRole}</td><td className="px-3 py-2">{row.trainingHours ?? "-"} / {row.cpdUnits ?? "-"}</td></tr>)}</tbody></table></div>
          </CardContent></Card>
        </TabsContent>
        <TabsContent value="all">
          <Card className="glass-card"><CardContent className="space-y-3 pt-5">
            <div className="overflow-auto rounded-md border"><table className="min-w-full text-sm"><thead><tr className="bg-muted/50 text-left"><th className="px-3 py-2">Staff</th><th className="px-3 py-2">Area</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Full Date</th><th className="px-3 py-2">Occurrence</th><th className="px-3 py-2">Role</th></tr></thead><tbody>{allAttendees.map((row) => <tr key={row.id} className="border-t"><td className="px-3 py-2"><Link href={`/nurses/${row.nurseId}`} className="font-medium text-primary hover:underline">{row.staffName}</Link><div className="text-xs text-muted-foreground">{row.staffType}</div></td><td className="px-3 py-2">{row.areaName}</td><td className="px-3 py-2">{row.status}</td><td className="px-3 py-2">{formatDate(row.completionDate)}</td><td className="px-3 py-2">{formatDate(row.occurrenceStartDate)}{row.occurrenceEndDate && String(row.occurrenceEndDate) !== String(row.occurrenceStartDate) ? ` to ${formatDate(row.occurrenceEndDate)}` : ""}</td><td className="px-3 py-2">{row.participationRole}</td></tr>)}</tbody></table></div>
          </CardContent></Card>
        </TabsContent>
        <TabsContent value="missing"><Card className="glass-card"><CardContent className="space-y-3 pt-5"><Button variant="outline" onClick={() => exportRows(true)} disabled={!data.missing.length}><Download className="mr-1 h-4 w-4" />CSV</Button><div className="overflow-auto rounded-md border"><table className="min-w-full text-sm"><thead><tr className="bg-muted/50 text-left"><th className="px-3 py-2">Staff</th><th className="px-3 py-2">Staff Type</th><th className="px-3 py-2">Area</th></tr></thead><tbody>{data.missing.map((row) => <tr key={row.id} className="border-t"><td className="px-3 py-2"><Link href={`/nurses/${row.id}`} className="font-medium text-primary hover:underline">{row.staffName}</Link></td><td className="px-3 py-2">{row.staffType}</td><td className="px-3 py-2">{row.areaName}</td></tr>)}</tbody></table></div></CardContent></Card></TabsContent>
      </Tabs>
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">Delete Seminar Permanently?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                Delete <strong>{data.training.name}</strong> on {formatDate(data.event.startDate)}?
              </p>
              <p className="text-xs text-muted-foreground">
                This removes the seminar and {data.attendees.length} linked attendance record(s). This action cannot be undone.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={remove.isPending}
              onClick={() => remove.mutate({ eventId })}
            >
              {remove.isPending ? "Deleting..." : "Permanently Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AttendanceDialog open={dialogOpen} onOpenChange={setDialogOpen} eventId={eventId} defaultDate={dateKey(data.event.startDate)} />
    </div>
  );
}

function AttendanceDialog({ open, onOpenChange, eventId, defaultDate }: { open: boolean; onOpenChange: (open: boolean) => void; eventId: number; defaultDate: string }) {
  const utils = trpc.useUtils();
  const { data: staff } = trpc.nurses.list.useQuery({ archived: false }, { enabled: open });
  const [nurseId, setNurseId] = useState(""); const [status, setStatus] = useState("Completed"); const [completionDate, setCompletionDate] = useState(defaultDate); const [role, setRole] = useState("Participant"); const [hours, setHours] = useState(""); const [cpd, setCpd] = useState(""); const [remarks, setRemarks] = useState("");
  const needsCompletionDate = status === "Completed" || status === "Expired";
  const add = trpc.seminars.addAttendance.useMutation({ onSuccess: async () => { toast.success("Attendance added."); await utils.seminars.detail.invalidate({ eventId }); await utils.seminars.list.invalidate(); onOpenChange(false); setNurseId(""); }, onError: (error) => toast.error(error.message) });
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>Add Seminar Attendance</DialogTitle></DialogHeader><div className="grid grid-cols-2 gap-4"><div className="col-span-2"><Label className="mb-1 block">Staff member *</Label><Select value={nurseId} onValueChange={setNurseId}><SelectTrigger><SelectValue placeholder="Select staff" /></SelectTrigger><SelectContent>{staff?.map((person) => <SelectItem key={person.id} value={String(person.id)}>{person.lastName}, {person.firstName} ({person.staffType})</SelectItem>)}</SelectContent></Select></div><div><Label className="mb-1 block">Status</Label><Select value={status} onValueChange={setStatus}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{TRAINING_STATUSES.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></div><div><Label className="mb-1 block">Full completion date{needsCompletionDate ? " *" : ""}</Label><Input type="date" value={completionDate} disabled={!needsCompletionDate} onChange={(event) => setCompletionDate(event.target.value)} /></div><div><Label className="mb-1 block">Participation role</Label><Select value={role} onValueChange={setRole}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{PARTICIPATION_ROLES.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></div><div className="grid grid-cols-2 gap-2"><div><Label className="mb-1 block">Hours</Label><Input type="number" min={1} value={hours} onChange={(event) => setHours(event.target.value)} /></div><div><Label className="mb-1 block">CPD</Label><Input type="number" min={1} value={cpd} onChange={(event) => setCpd(event.target.value)} /></div></div><div className="col-span-2"><Label className="mb-1 block">Remarks</Label><Textarea value={remarks} onChange={(event) => setRemarks(event.target.value)} /></div><div className="col-span-2 flex justify-end gap-2"><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={!nurseId || (needsCompletionDate && !completionDate) || add.isPending} onClick={() => add.mutate({ eventId, nurseId: Number(nurseId), status: status as (typeof TRAINING_STATUSES)[number], completionDate: needsCompletionDate ? completionDate : undefined, participationRole: role as (typeof PARTICIPATION_ROLES)[number], trainingHours: hours ? Number(hours) : undefined, cpdUnits: cpd ? Number(cpd) : undefined, remarks: remarks || undefined })}>Add</Button></div></div></DialogContent></Dialog>;
}
