import { FileUploadButton } from "@/components/nursetrack/FileUpload";
import { TrainingStatusBadge } from "@/components/nursetrack/StatusBadge";
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
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { formatDate, nurseFullName } from "../../../shared/nursetrack";
import { BookOpen, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

const RECORD_STATUSES = ["Scheduled", "Completed", "Expired", "Cancelled"] as const;

export default function Trainings() {
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [recordOpen, setRecordOpen] = useState(false);
  const [editRecordId, setEditRecordId] = useState<number | null>(null);
  const [certUploadId, setCertUploadId] = useState<number | null>(null);

  const utils = trpc.useUtils();
  const { data: catalog, isLoading: catalogLoading } = trpc.trainings.listCatalog.useQuery();
  const { data: records, isLoading: recordsLoading } = trpc.trainings.listRecords.useQuery();

  if (catalogLoading || recordsLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Trainings</h1>
          <p className="text-sm text-muted-foreground">Catalog of training types and recorded training events</p>
        </div>
      </div>

      <Tabs defaultValue="records" className="w-full">
        <TabsList>
          <TabsTrigger value="records">Training Records ({records?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="catalog">Catalog ({catalog?.length ?? 0})</TabsTrigger>
        </TabsList>

        <TabsContent value="records">
          <RecordsTab
            records={records ?? []}
            onAdd={() => {
              setEditRecordId(null);
              setRecordOpen(true);
            }}
            onEdit={(id) => {
              setEditRecordId(id);
              setRecordOpen(true);
            }}
            onUploadCert={(id) => setCertUploadId(id)}
            certUploadId={certUploadId}
            setCertUploadId={setCertUploadId}
            utils={utils}
          />
        </TabsContent>

        <TabsContent value="catalog">
          <CatalogTab
            catalog={catalog ?? []}
            onAdd={() => setCatalogOpen(true)}
            utils={utils}
          />
        </TabsContent>
      </Tabs>

      {recordOpen && (
        <TrainingRecordDialog
          open={recordOpen}
          onOpenChange={setRecordOpen}
          recordId={editRecordId}
          utils={utils}
          catalog={catalog ?? []}
        />
      )}
      {catalogOpen && <CatalogDialog open={catalogOpen} onOpenChange={setCatalogOpen} utils={utils} />}
    </div>
  );
}

function RecordsTab({
  records,
  onAdd,
  onEdit,
  onUploadCert,
  certUploadId,
  setCertUploadId,
  utils,
}: {
  records: {
    id: number;
    nurseId: number;
    nurseName?: string;
    trainingName?: string;
    trainingId: number;
    status: string;
    derivedStatus?: string;
    provider?: string | null;
    scheduledDate?: Date | string | null;
    completionDate?: Date | string | null;
    expiryDate?: Date | string | null;
    trainingHours?: number | null;
    cpdUnits?: number | null;
    certificateNumber?: string | null;
    certificateKey?: string | null;
    remarks?: string | null;
  }[];
  onAdd: () => void;
  onEdit: (id: number) => void;
  onUploadCert: (id: number) => void;
  certUploadId: number | null;
  setCertUploadId: (id: number | null) => void;
  utils: ReturnType<typeof trpc.useUtils>;
}) {
  const upload = trpc.trainings.uploadCertificate.useMutation({
    onSuccess: () => {
      toast.success("Certificate uploaded.");
      utils.trainings.listRecords.invalidate();
      setCertUploadId(null);
    },
    onError: (e) => toast.error(e.message),
  });
  const mark = trpc.trainings.updateRecord.useMutation({
    onSuccess: () => {
      toast.success("Record updated.");
      utils.trainings.listRecords.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const target = records.find((r) => r.id === certUploadId);

  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex justify-end mb-3">
          <Button size="sm" onClick={onAdd}>
            <Plus className="h-4 w-4 mr-1" />
            Add Training Record
          </Button>
        </div>
        {records.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No training records yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left">
                  <th className="px-3 py-2.5 font-medium">Nurse</th>
                  <th className="px-3 py-2.5 font-medium">Training</th>
                  <th className="px-3 py-2.5 font-medium">Provider</th>
                  <th className="px-3 py-2.5 font-medium">Scheduled</th>
                  <th className="px-3 py-2.5 font-medium">Completed</th>
                  <th className="px-3 py-2.5 font-medium">Expires</th>
                  <th className="px-3 py-2.5 font-medium">Hours</th>
                  <th className="px-3 py-2.5 font-medium">CPD</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="px-3 py-2.5 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {records.map((r) => (
                  <tr key={r.id}>
                    <td className="px-3 py-2.5">{r.nurseName ?? `#${r.nurseId}`}</td>
                    <td className="px-3 py-2.5">{r.trainingName ?? `#${r.trainingId}`}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{r.provider ?? "—"}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{formatDate(r.scheduledDate)}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{formatDate(r.completionDate)}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{formatDate(r.expiryDate)}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{r.trainingHours ?? "—"}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{r.cpdUnits ?? "—"}</td>
                    <td className="px-3 py-2.5">
                      <TrainingStatusBadge status={r.status} />
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onEdit(r.id)}
                        >
                          Edit
                        </Button>
                        {r.status === "Completed" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => mark.mutate({ id: r.id, status: "Expired" })}
                          >
                            Expire
                          </Button>
                        )}
                        <FileUploadButton
                          kind="document"
                          label={target?.id === r.id ? "Uploading…" : "Upload Cert"}
                          disabled={upload.isPending}
                          onFile={(f) => upload.mutate({ recordId: r.id, ...f })}
                        />
                      </div>
                    </td>
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

function CatalogTab({
  catalog,
  onAdd,
  utils,
}: {
  catalog: {
    id: number;
    name: string;
    category?: string | null;
    renewalRequired?: boolean | null;
    defaultValidityMonths?: number | null;
    active: boolean;
  }[];
  onAdd: () => void;
  utils: ReturnType<typeof trpc.useUtils>;
}) {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex justify-end mb-3">
          <Button size="sm" onClick={onAdd}>
            <Plus className="h-4 w-4 mr-1" />
            Add to Catalog
          </Button>
        </div>
        {catalog.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No training types in the catalog.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {catalog.map((c) => (
              <div key={c.id} className="border rounded-lg p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{c.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {[c.category, c.defaultValidityMonths ? `valid ${c.defaultValidityMonths} mo` : null].filter(Boolean).join(" · ") || "—"}
                    </p>
                  </div>
                  <BookOpen className="h-4 w-4 text-muted-foreground shrink-0" />
                </div>
                {c.renewalRequired && (
                  <p className="mt-2 text-xs font-medium text-orange-600">Renewal required</p>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CatalogDialog({
  open,
  onOpenChange,
  utils,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  utils: ReturnType<typeof trpc.useUtils>;
}) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [renewalRequired, setRenewalRequired] = useState(false);
  const [months, setMonths] = useState("");

  const create = trpc.trainings.createCatalogItem.useMutation({
    onSuccess: () => {
      toast.success("Training type added to catalog.");
      utils.trainings.listCatalog.invalidate();
      onOpenChange(false);
      setName("");
      setCategory("");
      setRenewalRequired(false);
      setMonths("");
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Training Type</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div>
            <Label className="mb-1 block">Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Basic Life Support" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="mb-1 block">Category</Label>
              <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g., Clinical" />
            </div>
            <div>
              <Label className="mb-1 block">Default Validity (months)</Label>
              <Input
                type="number"
                min={1}
                max={600}
                value={months}
                onChange={(e) => setMonths(e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={renewalRequired} onCheckedChange={setRenewalRequired} />
            <Label>Renewal required</Label>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button
              disabled={create.isPending || !name.trim()}
              onClick={() =>
                create.mutate({
                  name: name.trim(),
                  category: category.trim() || undefined,
                  renewalRequired,
                  defaultValidityMonths: months ? Number(months) : undefined,
                })
              }
            >
              Add
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TrainingRecordDialog({
  open,
  onOpenChange,
  recordId,
  utils,
  catalog,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  recordId: number | null;
  utils: ReturnType<typeof trpc.useUtils>;
  catalog: { id: number; name: string; defaultValidityMonths?: number | null }[];
}) {
  const [, navigate] = useLocation();
  const [nurseId, setNurseId] = useState("");
  const [trainingId, setTrainingId] = useState("");
  const [provider, setProvider] = useState("");
  const [status, setStatus] = useState("Scheduled");
  const [scheduledDate, setScheduledDate] = useState("");
  const [completionDate, setCompletionDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [hours, setHours] = useState("");
  const [cpd, setCpd] = useState("");
  const [certNumber, setCertNumber] = useState("");
  const [remarks, setRemarks] = useState("");

  const existing = recordId ? undefined : undefined;

  const create = trpc.trainings.createRecord.useMutation({
    onSuccess: () => {
      toast.success("Training record added.");
      utils.trainings.listRecords.invalidate();
      onOpenChange(false);
    },
    onError: (e) => toast.error(e.message),
  });
  const update = trpc.trainings.updateRecord.useMutation({
    onSuccess: () => {
      toast.success("Training record updated.");
      utils.trainings.listRecords.invalidate();
      onOpenChange(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const valid = recordId || (nurseId.trim() && trainingId.trim());

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{recordId ? "Edit Training Record" : "Add Training Record"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          {!recordId && (
            <div>
              <Label className="mb-1 block">Nurse ID (numeric) *</Label>
              <Input
                type="number"
                min={1}
                value={nurseId}
                onChange={(e) => setNurseId(e.target.value)}
                placeholder="e.g., 1"
              />
              <button
                type="button"
                className="text-xs text-primary underline mt-1"
                onClick={() => navigate("/nurses")}
              >
                Find a nurse
              </button>
            </div>
          )}
          <div className={recordId ? "col-span-2" : undefined}>
            <Label className="mb-1 block">Training Type *</Label>
            <Select value={trainingId} onValueChange={setTrainingId}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Select training…" /></SelectTrigger>
              <SelectContent>
                {catalog.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-1 block">Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {RECORD_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-1 block">Provider</Label>
            <Input value={provider} onChange={(e) => setProvider(e.target.value)} placeholder="e.g., SKTI HRD" />
          </div>
          <div>
            <Label className="mb-1 block">Scheduled Date</Label>
            <Input type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1 block">Completion Date</Label>
            <Input type="date" value={completionDate} onChange={(e) => setCompletionDate(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1 block">Expiry Date</Label>
            <Input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="mb-1 block">Training Hours</Label>
              <Input type="number" min={1} value={hours} onChange={(e) => setHours(e.target.value)} />
            </div>
            <div>
              <Label className="mb-1 block">CPD Units</Label>
              <Input type="number" min={1} value={cpd} onChange={(e) => setCpd(e.target.value)} />
            </div>
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
              disabled={create.isPending || update.isPending || !valid}
              onClick={() => {
                const data = {
                  trainingId: Number(trainingId),
                  provider: provider.trim() || undefined,
                  status: status as never,
                  scheduledDate: scheduledDate ? new Date(scheduledDate) : undefined,
                  completionDate: completionDate ? new Date(completionDate) : undefined,
                  expiryDate: expiryDate ? new Date(expiryDate) : undefined,
                  trainingHours: hours ? Number(hours) : undefined,
                  cpdUnits: cpd ? Number(cpd) : undefined,
                  certificateNumber: certNumber.trim() || undefined,
                  remarks: remarks.trim() || undefined,
                };
                if (recordId) update.mutate({ id: recordId, ...data });
                else create.mutate({ nurseId: Number(nurseId), ...data });
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
