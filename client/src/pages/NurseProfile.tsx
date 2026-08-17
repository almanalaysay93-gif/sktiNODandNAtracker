import { AreaSelect } from "@/components/nursetrack/AreaSelect";
import { FileUploadButton } from "@/components/nursetrack/FileUpload";
import { NurseAvatar } from "@/components/nursetrack/NurseAvatar";
import {
  LicenseStatusBadge,
  EmploymentStatusBadge,
  TrainingStatusBadge,
} from "@/components/nursetrack/StatusBadge";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import {
  formatDate,
  durationBetween,
  nurseFullName,
  EMPLOYMENT_STATUSES,
  ASSIGNMENT_TYPES,
} from "../../../shared/nursetrack";
import {
  ArrowLeft,
  CalendarCheck,
  CreditCard,
  FileText,
  MapPin,
  Pencil,
  Trash2,
  Undo2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useLocation, useRoute } from "wouter";

const RENEWAL_STATUSES = ["Not Started", "Renewal In Progress", "Submitted", "Renewed"] as const;
const VERIFICATION_STATUSES = ["Unverified", "Pending Verification", "Verified"] as const;

function StatChip({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col items-center px-2.5 py-1 bg-muted/60 border rounded-lg min-w-16">
      <span className="text-base font-bold tabular-nums leading-tight">{value}</span>
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
    </div>
  );
}

export default function NurseProfile() {
  const [, params] = useRoute("/nurses/:id");
  const id = Number(params?.id);
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  const { data: nurse, isLoading } = trpc.nurses.get.useQuery({ id }, { enabled: !Number.isNaN(id) });
  const { data: assignments } = trpc.nurses.getAssignments.useQuery({ nurseId: id }, { enabled: !Number.isNaN(id) });
  const { data: credentials } = trpc.credentials.listForNurse.useQuery({ nurseId: id }, { enabled: !Number.isNaN(id) });
  const { data: trainings } = trpc.trainings.listForNurse.useQuery({ nurseId: id }, { enabled: !Number.isNaN(id) });
  const { data: compliance } = trpc.trainings.getCompliance.useQuery({ nurseId: id }, { enabled: !Number.isNaN(id) });
  const { data: catalog } = trpc.trainings.listCatalog.useQuery();

  const stats = useMemo(() => {
    const hire = nurse?.dateHired ? new Date(nurse.dateHired).getTime() : null;
    const experienceYears = hire ? Math.max(0, (Date.now() - hire) / (1000 * 60 * 60 * 24 * 365)).toFixed(1) : "—";
    const areasServed = new Set((assignments ?? []).map((a) => a.areaId)).size;
    const completedTrainings = (trainings ?? []).filter((t) => t.status === "Completed").length;
    let compliancePct = "—";
    if (compliance && catalog) {
      const total = Object.keys(compliance).length;
      const done = Object.values(compliance).filter((v) => {
        const c = v as unknown as { completed: boolean } | boolean;
        return typeof c === "object" && c !== null ? c.completed : Boolean(c);
      }).length;
      compliancePct = total > 0 ? Math.round((done / total) * 100).toString() : "—";
    }
    return { experienceYears, areasServed, completedTrainings, compliancePct };
  }, [nurse, assignments, trainings, compliance, catalog]);

  const changeArea = trpc.nurses.changeArea.useMutation({
    onSuccess: () => {
      toast.success("Area of assignment updated. History preserved.");
      utils.nurses.getAssignments.invalidate();
      utils.nurses.get.invalidate();
      utils.areas.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const archive = trpc.nurses.archive.useMutation({
    onSuccess: () => {
      toast.success("Nurse archived.");
      utils.nurses.get.invalidate();
      utils.nurses.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const restore = trpc.nurses.restore.useMutation({
    onSuccess: () => {
      toast.success("Nurse restored.");
      utils.nurses.get.invalidate();
      utils.nurses.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const [credOpen, setCredOpen] = useState(false);
  const [editCredId, setEditCredId] = useState<number | null>(null);
  const [areaOpen, setAreaOpen] = useState(false);
  const [newAreaId, setNewAreaId] = useState("");
  const [areaRemarks, setAreaRemarks] = useState("");
  const [areaType, setAreaType] = useState("Permanent Transfer");
  const [areaDate, setAreaDate] = useState(new Date().toISOString().slice(0, 10));

  if (Number.isNaN(id)) {
    return <p className="text-sm text-muted-foreground">Invalid nurse.</p>;
  }
  if (isLoading) {
    return <Skeleton className="h-72 w-full" />;
  }
  if (!nurse) {
    return <p className="text-sm text-muted-foreground">Nurse not found.</p>;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 flex-wrap">
        <Button variant="ghost" size="icon" onClick={() => navigate("/nurses")} aria-label="Back">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <NurseAvatar nurse={nurse} size="md" />
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight truncate">{nurseFullName(nurse)}</h1>
            <p className="text-sm text-muted-foreground">
              <span className="font-mono">{nurse.employeeId}</span>
              {nurse.position ? ` · ${nurse.position}` : ""}
              {nurse.dateHired ? ` · Hired ${formatDate(nurse.dateHired)}` : ""}
            </p>
          </div>
        </div>
        <div className="hidden lg:flex items-center gap-2 mr-2">
          <StatChip label="Years exp." value={stats.experienceYears} />
          <StatChip label="Areas" value={stats.areasServed} />
          <StatChip label="Trainings" value={stats.completedTrainings} />
          <StatChip label="Compliance" value={`${stats.compliancePct}${stats.compliancePct === "—" ? "" : "%"}`} />
        </div>
        <div className="flex items-center gap-2">
          <EmploymentStatusBadge status={nurse.employmentStatus ?? "Active"} />
          {nurse.licenseStatus ? <LicenseStatusBadge status={nurse.licenseStatus as never} /> : null}
          <Button variant="outline" size="sm" onClick={() => {
            utils.nurses.get.invalidate();
            navigate(`/nurses/${id}/edit`);
          }}>
            <Pencil className="h-4 w-4 mr-1" />
            Edit
          </Button>
          {!nurse.archivedAt ? (
            <Button variant="outline" size="sm" onClick={() => archive.mutate({ id })}>
              <Trash2 className="h-4 w-4 mr-1" />
              Archive
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              disabled={restore.isPending}
              onClick={() => restore.mutate({ id })}
            >
              <Undo2 className="h-4 w-4 mr-1" />
              Restore
            </Button>
          )}
        </div>
      </div>

      <Tabs defaultValue="assignments">
        <TabsList className="flex-wrap">
          <TabsTrigger value="assignments" className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> Assignments</TabsTrigger>
          <TabsTrigger value="licenses" className="flex items-center gap-1"><CreditCard className="h-3.5 w-3.5" /> Licenses</TabsTrigger>
          <TabsTrigger value="trainings" className="flex items-center gap-1"><CalendarCheck className="h-3.5 w-3.5" /> Trainings</TabsTrigger>
          <TabsTrigger value="details" className="flex items-center gap-1"><FileText className="h-3.5 w-3.5" /> Details</TabsTrigger>
        </TabsList>

        <TabsContent value="assignments">
          <Card>
            <CardContent className="pt-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-medium">Area Assignment History</h2>
                <Button
                  size="sm"
                  onClick={() => setAreaOpen(true)}
                >
                  <MapPin className="h-4 w-4 mr-1" />
                  Change Area
                </Button>
              </div>
              {(assignments ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No assignments recorded.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50 text-left">
                        <th className="px-3 py-2.5 font-medium">Area</th>
                        <th className="px-3 py-2.5 font-medium">Type</th>
                        <th className="px-3 py-2.5 font-medium">Start</th>
                        <th className="px-3 py-2.5 font-medium">End</th>
                        <th className="px-3 py-2.5 font-medium">Remarks</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {(assignments ?? []).map((a) => (
                        <tr key={a.id} className={a.isCurrent ? "bg-accent/40" : undefined}>
                          <td className="px-3 py-2.5 font-medium">
                            {a.area?.name ?? `Area #${a.areaId}`}
                            {a.isCurrent && <span className="ml-2 text-xs text-primary">Current</span>}
                          </td>
                          <td className="px-3 py-2.5 text-muted-foreground">{a.assignmentType ?? "—"}</td>
                          <td className="px-3 py-2.5 text-muted-foreground">{formatDate(a.startDate)}</td>
                          <td className="px-3 py-2.5 text-muted-foreground">{a.endDate ? formatDate(a.endDate) : "Present"}</td>
                          <td className="px-3 py-2.5 text-muted-foreground">{durationBetween(a.startDate, a.endDate)}</td>
                          <td className="px-3 py-2.5 text-muted-foreground">{a.remarks ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="licenses">
          <Card>
            <CardContent className="pt-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-medium">Credentials & Licenses</h2>
                <Button size="sm" onClick={() => {
                  setEditCredId(null);
                  setCredOpen(true);
                }}>
                  <Pencil className="h-4 w-4 mr-1" />
                  Add Credential
                </Button>
              </div>
              {(credentials ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No credentials on file.</p>
              ) : (
                <div className="grid gap-3">
                  {(credentials ?? []).map((c) => (
                    <div key={c.id} className="border rounded-lg p-3.5">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="min-w-0">
                          <p className="font-medium">{c.typeName}</p>
                          <p className="text-xs text-muted-foreground font-mono">
                            {c.licenseNumber ?? "No license number"}
                            {c.issuingOrganization ? ` · ${c.issuingOrganization}` : ""}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Issued {formatDate(c.issueDate)} · Expires {formatDate(c.expiryDate)}
                            {c.daysRemaining != null ? ` · ${c.daysRemaining} days remaining` : ""}
                          </p>
                          <div className="flex flex-wrap items-center gap-1.5 mt-2">
                            <LicenseStatusBadge status={c.derivedStatus ?? "Valid"} />
                            <span className="text-xs bg-muted px-1.5 py-0.5 rounded">{c.renewalStatus}</span>
                            <span className="text-xs bg-muted px-1.5 py-0.5 rounded">{c.verificationStatus}</span>
                          </div>
                        </div>
                        <div className="flex flex-col gap-1.5 items-end">
                          <Button variant="ghost" size="sm" onClick={() => {
                            setEditCredId(c.id);
                            setCredOpen(true);
                          }}>
                            Edit
                          </Button>
                          <FileUploadButton
                            kind="document"
                            label="Upload Document"
                            onFile={(f) => utils.client.credentials.uploadDocument.mutate({ credentialId: c.id, ...f })}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="trainings">
          <Card>
            <CardContent className="pt-5">
              <h2 className="font-medium mb-3">Training Records</h2>
              {(trainings ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No training records yet. Add them on the Trainings page.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50 text-left">
                        <th className="px-3 py-2.5 font-medium">Training</th>
                        <th className="px-3 py-2.5 font-medium">Provider</th>
                        <th className="px-3 py-2.5 font-medium">Scheduled</th>
                        <th className="px-3 py-2.5 font-medium">Completed</th>
                        <th className="px-3 py-2.5 font-medium">Expires</th>
                        <th className="px-3 py-2.5 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {(trainings ?? []).map((t) => (
                        <tr key={t.id}>
                          <td className="px-3 py-2.5">{t.trainingName}</td>
                          <td className="px-3 py-2.5 text-muted-foreground">{t.provider ?? "—"}</td>
                          <td className="px-3 py-2.5 text-muted-foreground">{formatDate(t.scheduledDate)}</td>
                          <td className="px-3 py-2.5 text-muted-foreground">{formatDate(t.completionDate)}</td>
                          <td className="px-3 py-2.5 text-muted-foreground">{formatDate(t.expiryDate)}</td>
                          <td className="px-3 py-2.5"><TrainingStatusBadge status={t.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {compliance && (
                <div className="mt-4 border-t pt-4">
                  <h3 className="text-sm font-medium mb-2">Compliance (Required Trainings)</h3>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(compliance).map(([name, item]) => {
                      const i = item as unknown as { completed: boolean } | boolean;
                      const completed = typeof i === "object" && i !== null ? i.completed : Boolean(i);
                      return (
                        <span
                          key={name}
                          className={
                            completed
                              ? "text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full"
                              : "text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full"
                          }
                        >
                          {name}: {completed ? "Complete" : "Missing"}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="details">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardContent className="pt-5 space-y-2.5 text-sm">
                <DetailRow label="First Name" value={nurse.firstName} />
                <DetailRow label="Middle Name" value={nurse.middleName} />
                <DetailRow label="Last Name" value={nurse.lastName} />
                <DetailRow label="Suffix" value={nurse.suffix} />
                <DetailRow label="Employee ID" value={nurse.employeeId} />
                <DetailRow label="Position" value={nurse.position} />

                <DetailRow label="Date Hired" value={nurse.dateHired ? formatDate(nurse.dateHired) : "—"} />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5 space-y-2.5 text-sm">
                <DetailRow
                  label="Current Area"
                  value={nurse.currentArea ? nurse.currentArea.name : "Unassigned"}
                />
                <DetailRow label="Employment Status" value={nurse.employmentStatus ?? "Active"} />
                <DetailRow label="Archived" value={nurse.archivedAt ? formatDate(nurse.archivedAt) : "No"} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {credOpen && (
        <CredentialDialog
          open={credOpen}
          onOpenChange={setCredOpen}
          credentialId={editCredId}
          nurseId={id}
          utils={utils}
        />
      )}

      <Dialog open={areaOpen} onOpenChange={setAreaOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Area of Assignment</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div>
              <Label className="mb-1 block">Current Area</Label>
              <p className="text-sm text-muted-foreground">{nurse.currentArea ? nurse.currentArea.name : "Unassigned"}</p>
            </div>
            <AreaSelect value={newAreaId} onValueChange={setNewAreaId} />
            <div>
              <Label className="mb-1 block">Effective Date *</Label>
              <Input
                type="date"
                max={new Date().toISOString().slice(0, 10)}
                value={areaDate}
                onChange={(e) => setAreaDate(e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1">Backdated changes create a historical assignment and update the current area.</p>
            </div>
            <div>
              <Label className="mb-1 block">Assignment Type *</Label>
              <Select value={areaType} onValueChange={setAreaType}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select type…" />
                </SelectTrigger>
                <SelectContent>
                  {ASSIGNMENT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1 block">Remarks</Label>
              <Textarea value={areaRemarks} onChange={(e) => setAreaRemarks(e.target.value)} placeholder="Reason for the change…" />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setAreaOpen(false)}>Cancel</Button>
              <Button
                disabled={changeArea.isPending || !newAreaId || !areaDate}
                onClick={() => {
                  changeArea.mutate({
                    nurseId: id,
                    newAreaId: Number(newAreaId),
                    effectiveDate: new Date(`${areaDate}T00:00:00`),
                    assignmentType: areaType as "Permanent Transfer",
                    remarks: areaRemarks.trim() || undefined,
                  });
                  setAreaOpen(false);
                  setNewAreaId("");
                  setAreaRemarks("");
                  setAreaType("Permanent Transfer");
                  setAreaDate(new Date().toISOString().slice(0, 10));
                }}
              >
                Confirm Change
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="text-right truncate">{value ?? "—"}</span>
    </div>
  );
}

function CredentialDialog({
  open,
  onOpenChange,
  credentialId,
  nurseId,
  utils,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  credentialId: number | null;
  nurseId: number;
  utils: ReturnType<typeof trpc.useUtils>;
}) {
  const { data: existing } = trpc.credentials.listForNurse.useQuery({ nurseId }, { enabled: open && !!credentialId });
  const { data: types } = trpc.credentials.listTypes.useQuery();
  const current = existing?.find((c) => c.id === credentialId);

  const [typeId, setTypeId] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [issuingOrg, setIssuingOrg] = useState("");
  const [issueDate, setIssueDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [renewalStatus, setRenewalStatus] = useState("Not Started");
  const [verificationStatus, setVerificationStatus] = useState("Unverified");
  const [certNumber, setCertNumber] = useState("");
  const [remarks, setRemarks] = useState("");

  const create = trpc.credentials.create.useMutation({
    onSuccess: () => {
      toast.success("Credential added.");
      utils.credentials.listForNurse.invalidate();
      utils.nurses.get.invalidate();
      onOpenChange(false);
    },
    onError: (e) => toast.error(e.message),
  });
  const update = trpc.credentials.update.useMutation({
    onSuccess: () => {
      toast.success("Credential updated.");
      utils.credentials.listForNurse.invalidate();
      utils.nurses.get.invalidate();
      onOpenChange(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const createData = {
    nurseId,
    credentialTypeId: Number(typeId),
    licenseNumber: licenseNumber.trim() || undefined,
    issuingOrganization: issuingOrg.trim() || undefined,
    issueDate: issueDate ? new Date(issueDate) : undefined,
    expiryDate: expiryDate ? new Date(expiryDate) : undefined,
    renewalStatus: renewalStatus as never,
    verificationStatus: verificationStatus as never,
    remarks: remarks.trim() || undefined,
  } as {
    nurseId: number;
    credentialTypeId: number;
    licenseNumber?: string;
    issuingOrganization?: string;
    issueDate?: Date | null;
    expiryDate: Date;
    renewalStatus?: "Not Started" | "Renewal In Progress" | "Submitted" | "Renewed";
    verificationStatus?: "Unverified" | "Pending Verification" | "Verified";
    remarks?: string;
  };
  const updateData = {
    id: credentialId as number,
    licenseNumber: licenseNumber.trim() || undefined,
    issuingOrganization: issuingOrg.trim() || undefined,
    issueDate: issueDate ? new Date(issueDate) : undefined,
    expiryDate: expiryDate ? new Date(expiryDate) : undefined,
    renewalStatus: renewalStatus as never,
    verificationStatus: verificationStatus as never,
    remarks: remarks.trim() || undefined,
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{credentialId ? "Edit Credential" : "Add Credential"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Label className="mb-1 block">Credential Type *</Label>
            <Select value={typeId} onValueChange={setTypeId}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Select type…" /></SelectTrigger>
              <SelectContent>
                {(types ?? []).map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-1 block">License Number</Label>
            <Input value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1 block">Issuing Organization</Label>
            <Input value={issuingOrg} onChange={(e) => setIssuingOrg(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1 block">Issue Date</Label>
            <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1 block">Expiry Date *</Label>
            <Input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1 block">Renewal Status</Label>
            <Select value={renewalStatus} onValueChange={setRenewalStatus}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {RENEWAL_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-1 block">Verification Status</Label>
            <Select value={verificationStatus} onValueChange={setVerificationStatus}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {VERIFICATION_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-1 block">Certificate Number</Label>
            <Input value={certNumber} onChange={(e) => setCertNumber(e.target.value)} />
          </div>
          <div className="col-span-2">
            <Label className="mb-1 block">Remarks</Label>
            <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </div>
          <div className="col-span-2 flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button
              disabled={create.isPending || update.isPending || !typeId || !expiryDate}
              onClick={() => {
                if (credentialId) update.mutate(updateData);
                else create.mutate(createData);
              }}
            >
              Save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
