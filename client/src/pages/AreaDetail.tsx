import { NurseAvatar } from "@/components/nursetrack/NurseAvatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { nurseFullName, ASSIGNMENT_TYPES, formatDate } from "../../../shared/nursetrack";
import { ArrowLeft, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useLocation, useRoute } from "wouter";

export default function AreaDetail() {
  const [, params] = useRoute("/areas/:id");
  const id = Number(params?.id);
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");

  const { data: area, isLoading } = trpc.areas.get.useQuery({ id }, { enabled: !Number.isNaN(id) });
  const { data: requirements } = trpc.trainings.getAreaRequirements.useQuery({ areaId: id }, { enabled: !Number.isNaN(id) });
  const [backfillOpen, setBackfillOpen] = useState(false);
  const [backfillNurseId, setBackfillNurseId] = useState<number | null>(null);
  const [backfillStart, setBackfillStart] = useState("");
  const [backfillEnd, setBackfillEnd] = useState("");
  const [backfillType, setBackfillType] = useState("Temporary Reassignment");
  const [backfillRemarks, setBackfillRemarks] = useState("");

  const filtered = useMemo(() => {
    const rows = (area?.staff ?? []).filter((s) => {
      if (!search.trim()) return true;
      const n = s.nurse;
      return nurseFullName(n).toLowerCase().includes(search.trim().toLowerCase()) || n.employeeId.toLowerCase().includes(search.trim().toLowerCase());
    });
    return rows;
  }, [area, search]);

  if (Number.isNaN(id)) {
    return <p className="text-sm text-muted-foreground">Invalid area.</p>;
  }
  if (isLoading) {
    return <Skeleton className="h-64 w-full" />;
  }
  if (!area) {
    return <p className="text-sm text-muted-foreground">Area not found.</p>;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate("/areas")} aria-label="Back">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {area.name} <span className="font-mono text-sm text-muted-foreground">{area.code}</span>
          </h1>
          {area.description && <p className="text-sm text-muted-foreground">{area.description}</p>}
        </div>
      </div>

      <Card>
        <CardContent className="pt-5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <h2 className="font-medium">Staff Currently Assigned ({filtered.length})</h2>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Filter staff…"
                  className="pl-8 w-56"
                />
              </div>
              <Button variant="outline" size="sm" onClick={() => setBackfillOpen(true)}>
                <Plus className="h-4 w-4 mr-1" />
                Backfill Assignment
              </Button>
            </div>
          </div>
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No nurses currently assigned to this area.</p>
          ) : (
            <div className="divide-y">
              {filtered.map(({ assignment, nurse }) => (
                <div
                  key={assignment.id}
                  className="flex items-center gap-3 py-2.5 hover:bg-accent/50 rounded px-1 cursor-pointer"
                  onClick={() => navigate(`/nurses/${nurse.id}`)}
                >
                  <NurseAvatar nurse={nurse} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{nurseFullName(nurse)}</p>
                    <p className="text-xs text-muted-foreground font-mono">{nurse.employeeId}</p>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    <p>{assignment.assignmentType}</p>
                    <p>Since {formatDate(assignment.startDate)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5">
          <h2 className="font-medium mb-3">Required Trainings</h2>
          {!requirements ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : requirements.length === 0 ? (
            <p className="text-sm text-muted-foreground">No trainings are required for this area yet. Add them on the Trainings page.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {(requirements as number[]).map((tid) => (
                <span key={tid} className="text-xs bg-accent text-accent-foreground px-2 py-1 rounded-full">Training #{tid}</span>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <BackfillDialog
        open={backfillOpen}
        onOpenChange={setBackfillOpen}
        areaId={id}
        nurseId={backfillNurseId}
        setNurseId={setBackfillNurseId}
        startDate={backfillStart}
        setStartDate={setBackfillStart}
        endDate={backfillEnd}
        setEndDate={setBackfillEnd}
        assignmentType={backfillType}
        setAssignmentType={setBackfillType}
        remarks={backfillRemarks}
        setRemarks={setBackfillRemarks}
        utils={utils}
      />
    </div>
  );
}

function BackfillDialog(props: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  areaId: number;
  nurseId: number | null;
  setNurseId: (v: number | null) => void;
  startDate: string;
  setStartDate: (v: string) => void;
  endDate: string;
  setEndDate: (v: string) => void;
  assignmentType: string;
  setAssignmentType: (v: string) => void;
  remarks: string;
  setRemarks: (v: string) => void;
  utils: ReturnType<typeof trpc.useUtils>;
}) {
  const backfill = trpc.nurses.backfillAssignment.useMutation({
    onSuccess: () => {
      toast.success("Assignment backfilled.");
      props.utils.nurses.getAssignments.invalidate();
      props.utils.areas.get.invalidate();
      props.onOpenChange(false);
      props.setNurseId(null);
      props.setStartDate("");
      props.setEndDate("");
      props.setRemarks("");
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Backfill Historical Assignment</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div>
            <Label className="mb-1 block">Nurse ID (numeric)</Label>
            <Input
              value={props.nurseId ?? ""}
              onChange={(e) => props.setNurseId(e.target.value ? Number(e.target.value) : null)}
              placeholder="e.g., 1"
              type="number"
              min={1}
            />
            <p className="text-xs text-muted-foreground mt-1">Enter the nurse's numeric ID (shown on the nurse profile page).</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="mb-1 block">Start Date *</Label>
              <Input type="date" value={props.startDate} onChange={(e) => props.setStartDate(e.target.value)} />
            </div>
            <div>
              <Label className="mb-1 block">End Date</Label>
              <Input type="date" value={props.endDate} onChange={(e) => props.setEndDate(e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="mb-1 block">Assignment Type</Label>
            <Select value={props.assignmentType} onValueChange={props.setAssignmentType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ASSIGNMENT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-1 block">Remarks</Label>
            <Textarea value={props.remarks} onChange={(e) => props.setRemarks(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => props.onOpenChange(false)}>Cancel</Button>
            <Button
              disabled={backfill.isPending || !props.nurseId || !props.startDate}
              onClick={() => {
                const end = props.endDate ? new Date(props.endDate) : undefined;
                backfill.mutate({
                  nurseId: props.nurseId as number,
                  areaId: props.areaId,
                  startDate: new Date(props.startDate),
                  endDate: end as never,
                  assignmentType: props.assignmentType as never,
                  remarks: props.remarks.trim() || undefined,
                });
              }}
            >
              Save Assignment
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
