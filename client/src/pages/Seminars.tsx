import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { formatDate, TARGET_STAFF_TYPES } from "../../../shared/nursetrack";
import { CalendarDays, MapPin, Plus, Trash2, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import LdiReports from "./LdiReports";
import TrainingMatrix from "./TrainingMatrix";
import ExcelImportPreview from "./ExcelImportPreview";

export default function Seminars() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [seminarToDelete, setSeminarToDelete] = useState<{ id: number; name: string; kind: string; date: string; attendanceCount: number } | null>(null);
  const { data, isLoading } = trpc.seminars.list.useQuery(undefined);

  const deleteSeminar = trpc.seminars.deleteEvent.useMutation({
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
      setSeminarToDelete(null);
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Seminars & LDI</h1>
          <p className="text-sm text-muted-foreground">Track exact seminar dates, attendance, roles, and missing staff.</p>
        </div>
        <Button onClick={() => setDialogOpen(true)}><Plus className="mr-1 h-4 w-4" />Schedule Seminar</Button>
      </div>

      <Tabs defaultValue="schedule" className="space-y-3">
        <TabsList className="flex h-auto flex-wrap">
          <TabsTrigger value="schedule">Schedule</TabsTrigger>
          <TabsTrigger value="matrix">Training Matrix</TabsTrigger>
          <TabsTrigger value="reports">Monthly & Quarterly</TabsTrigger>
          <TabsTrigger value="import">Workbook Analyzer</TabsTrigger>
        </TabsList>
        <TabsContent value="schedule">
          {isLoading ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-48" />)}</div> : !data?.length ? (
            <Card className="glass-card"><CardContent className="py-14 text-center text-sm text-muted-foreground">No seminar occurrences yet. Create a catalog item under Trainings, then schedule it here.</CardContent></Card>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {data.map(({ event, training, attendance }) => (
                <Card key={event.id} className="glass-card cursor-pointer hover:border-primary group relative" onClick={() => navigate(`/seminars/${event.id}`)}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-xs font-medium uppercase tracking-wide text-primary">{training.kind}</div>
                        <CardTitle className="text-base leading-snug">{training.name}</CardTitle>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0"
                        title={`Delete ${training.kind}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSeminarToDelete({
                            id: event.id,
                            name: training.name,
                            kind: training.kind,
                            date: formatDate(event.startDate),
                            attendanceCount: attendance.total,
                          });
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-muted-foreground" /><span>{formatDate(event.startDate)}{String(event.endDate) !== String(event.startDate) ? ` to ${formatDate(event.endDate)}` : ""}</span></div>
                    <div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-muted-foreground" /><span>{event.venue || "Venue not set"}</span></div>
                    <div className="flex items-center gap-2"><Users className="h-4 w-4 text-muted-foreground" /><span>{attendance.completed} completed, {attendance.total} listed</span></div>
                    <div className="text-xs text-muted-foreground">Target: {event.targetStaffType}</div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
        <TabsContent value="matrix"><TrainingMatrix /></TabsContent>
        <TabsContent value="reports"><LdiReports /></TabsContent>
        <TabsContent value="import"><ExcelImportPreview /></TabsContent>
      </Tabs>

      <AlertDialog open={Boolean(seminarToDelete)} onOpenChange={(open) => !open && setSeminarToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">Delete {seminarToDelete?.kind ?? "Seminar"} Permanently?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">
                Delete <strong>{seminarToDelete?.name}</strong> on {seminarToDelete?.date}?
              </span>
              <span className="block text-xs text-muted-foreground">
                This removes the seminar occurrence and {seminarToDelete?.attendanceCount ?? 0} linked attendance record(s). This action cannot be undone.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteSeminar.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteSeminar.isPending}
              onClick={() => seminarToDelete && deleteSeminar.mutate({ eventId: seminarToDelete.id })}
            >
              {deleteSeminar.isPending ? "Deleting..." : "Permanently Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <SeminarDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}

function SeminarDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const utils = trpc.useUtils();
  const { data: catalog } = trpc.trainings.listCatalog.useQuery(undefined, { enabled: open });
  const [trainingId, setTrainingId] = useState("");
  const [provider, setProvider] = useState("");
  const [venue, setVenue] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [targetStaffType, setTargetStaffType] = useState("All");
  const [remarks, setRemarks] = useState("");
  const create = trpc.seminars.create.useMutation({
    onSuccess: async () => {
      toast.success("Seminar scheduled.");
      await utils.seminars.list.invalidate();
      onOpenChange(false);
      setTrainingId(""); setProvider(""); setVenue(""); setStartDate(""); setEndDate(""); setStartTime(""); setEndTime(""); setRemarks("");
    },
    onError: (error) => toast.error(error.message),
  });
  const valid = trainingId && startDate && endDate;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader><DialogTitle>Schedule Seminar or LDI</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2"><Label className="mb-1 block">Training catalog item *</Label><Select value={trainingId} onValueChange={setTrainingId}><SelectTrigger><SelectValue placeholder="Choose seminar or training" /></SelectTrigger><SelectContent>{catalog?.filter((item) => item.active).map((item) => <SelectItem key={item.id} value={String(item.id)}>{item.name} ({item.kind})</SelectItem>)}</SelectContent></Select></div>
          <div><Label className="mb-1 block">Start date *</Label><Input type="date" value={startDate} onChange={(event) => { setStartDate(event.target.value); if (!endDate) setEndDate(event.target.value); }} /></div>
          <div><Label className="mb-1 block">End date *</Label><Input type="date" min={startDate} value={endDate} onChange={(event) => setEndDate(event.target.value)} /></div>
          <div><Label className="mb-1 block">Start time</Label><Input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} /></div>
          <div><Label className="mb-1 block">End time</Label><Input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} /></div>
          <div><Label className="mb-1 block">Provider</Label><Input value={provider} onChange={(event) => setProvider(event.target.value)} /></div>
          <div><Label className="mb-1 block">Venue</Label><Input value={venue} onChange={(event) => setVenue(event.target.value)} /></div>
          <div className="col-span-2"><Label className="mb-1 block">Target staff</Label><Select value={targetStaffType} onValueChange={setTargetStaffType}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{TARGET_STAFF_TYPES.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent></Select></div>
          <div className="col-span-2"><Label className="mb-1 block">Remarks</Label><Textarea value={remarks} onChange={(event) => setRemarks(event.target.value)} /></div>
          <div className="col-span-2 flex justify-end gap-2"><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={!valid || create.isPending} onClick={() => create.mutate({ trainingId: Number(trainingId), provider: provider || undefined, venue: venue || undefined, startDate, endDate, startTime: startTime || undefined, endTime: endTime || undefined, targetStaffType: targetStaffType as (typeof TARGET_STAFF_TYPES)[number], remarks: remarks || undefined })}>Schedule</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
