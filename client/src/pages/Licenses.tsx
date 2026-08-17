import { FileUploadButton } from "@/components/nursetrack/FileUpload";
import { LicenseStatusBadge } from "@/components/nursetrack/StatusBadge";
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
import { trpc } from "@/lib/trpc";
import { formatDate, nurseFullName } from "../../../shared/nursetrack";
import { CalendarCheck, Pencil, Plus, RefreshCw, Search } from "lucide-react";
import { safeDateKey } from "@/lib/utils";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

const RENEWAL_STATUSES = ["Not Started", "Renewal In Progress", "Submitted", "Renewed"] as const;
const VERIFICATION_STATUSES = ["Unverified", "Pending Verification", "Verified"] as const;

export default function Licenses() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  // Single round-trip: server merges credentials + nurses + types.
  const { data: initial, isLoading } = trpc.credentials.initial.useQuery();
  const credentials = initial?.credentials;
  const nurses = initial?.nurses;
  const types = initial?.types;

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editCredential, setEditCredential] = useState<{ id: number; nurseId: number } | null>(null);
  const [renewCredential, setRenewCredential] = useState<{ id: number; nurseName: string } | null>(null);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return (credentials ?? []).filter((c) => {
      if (statusFilter !== "all" && c.derivedStatus !== statusFilter) return false;
      if (typeFilter !== "all" && c.typeName !== typeFilter) return false;
      if (q) {
        const hay = `${c.licenseNumber ?? ""} ${c.typeName} ${c.nurse ? nurseFullName(c.nurse) : ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [credentials, query, statusFilter, typeFilter]);

  if (isLoading) return <Skeleton className="h-96 w-full" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">License Registry</h1>
          <p className="text-sm text-muted-foreground">All credentials on file, sorted by urgency.</p>
        </div>
        <Button onClick={() => { setEditCredential(null); setFormOpen(true); }}>
          <Plus className="h-4 w-4 mr-1" />
          Add License
        </Button>
      </div>

      <Card className="glass-card">
        <CardContent className="pt-5">
          <div className="flex flex-wrap gap-3 mb-4">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search license number, nurse, type…"
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="Expired">Expired</SelectItem>
                <SelectItem value="Within 6 Months">Within 6 months</SelectItem>
                <SelectItem value="Within 1 Year">Within 1 year</SelectItem>
                <SelectItem value="Valid">Valid</SelectItem>
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {(types ?? []).map((t) => (
                  <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {(filtered ?? []).length === 0 ? (
            <div className="text-center py-12">
              <p className="text-sm text-muted-foreground">
                {credentials && credentials.length === 0
                  ? "No licenses recorded yet. Add credentials on a nurse's profile."
                  : "No licenses match the current filters."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-left">
                    <th className="px-3 py-2.5 font-medium">Nurse</th>
                    <th className="px-3 py-2.5 font-medium">Credential</th>
                    <th className="px-3 py-2.5 font-medium">License Number</th>
                    <th className="px-3 py-2.5 font-medium">Issued</th>
                    <th className="px-3 py-2.5 font-medium">Expires</th>
                    <th className="px-3 py-2.5 font-medium">Status</th>
                    <th className="px-3 py-2.5 font-medium">Renewal</th>
                    <th className="px-3 py-2.5 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map((c) => (
                    <tr key={c.id} className={c.derivedStatus === "Expired" ? "bg-red-50/50" : undefined}>
                      <td className="px-3 py-2.5">
                        <a
                          href={`/nurses/${c.nurseId}`}
                          className="font-medium text-primary hover:underline cursor-pointer"
                        >
                          {c.nurse ? nurseFullName(c.nurse) : `Nurse #${c.nurseId}`}
                        </a>
                        <p className="text-xs text-muted-foreground">{c.nurse?.employeeId}</p>
                      </td>
                      <td className="px-3 py-2.5">{c.typeName}</td>
                      <td className="px-3 py-2.5 font-mono text-xs">{c.licenseNumber ?? "—"}</td>
                      <td className="px-3 py-2.5 text-muted-foreground">{formatDate(c.issueDate)}</td>
                      <td className="px-3 py-2.5">{formatDate(c.expiryDate)}</td>
                      <td className="px-3 py-2.5"><LicenseStatusBadge status={c.derivedStatus} /></td>
                      <td className="px-3 py-2.5 text-xs">{c.renewalStatus}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="sm" onClick={() => navigate(`/nurses/${c.nurseId}`)}>
                            View
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditCredential({ id: c.id, nurseId: c.nurseId });
                              setFormOpen(true);
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <FileUploadButton
                            kind="document"
                            label="Upload"
                            onFile={(f) => utils.client.credentials.uploadDocument.mutate({ credentialId: c.id, ...f })}
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Mark renewed (creates a new record, preserving this one)"
                            onClick={() => setRenewCredential({ id: c.id, nurseName: c.nurse ? nurseFullName(c.nurse) : `Nurse #${c.nurseId}` })}
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                          </Button>
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

      <Card className="glass-card">
        <CardContent className="pt-5 flex items-center gap-2 text-sm text-muted-foreground">
          <CalendarCheck className="h-4 w-4" />
          Licenses expiring within 12 months trigger automatic daily reminders. Upload documents to keep the registry complete.
        </CardContent>
      </Card>

      {formOpen && (
        <CredentialDialog
          open={formOpen}
          onOpenChange={setFormOpen}
          editId={editCredential?.id ?? null}
          nurseId={editCredential?.nurseId ?? null}
        />
      )}
      {renewCredential && (
        <RenewDialog
          open={!!renewCredential}
          credentialId={renewCredential.id}
          onOpenChange={(v) => { if (!v) setRenewCredential(null); }}
        />
      )}
    </div>
  );
}

function CredentialDialog({
  open,
  onOpenChange,
  editId,
  nurseId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editId: number | null;
  nurseId: number | null;
}) {
  const utils = trpc.useUtils();
  const { data: nurses } = trpc.nurses.list.useQuery({ archived: false }, { enabled: open });
  const { data: types } = trpc.credentials.listTypes.useQuery(undefined, { enabled: open });
  const { data: existing } = trpc.credentials.list.useQuery(undefined, { enabled: open && editId !== null });
  const current = editId ? existing?.find((c) => c.id === editId) : undefined;

  const [selectedNurse, setSelectedNurse] = useState<number>(nurseId ?? 0);
  const [selectedType, setSelectedType] = useState<string>("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [issueDate, setIssueDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [renewalStatus, setRenewalStatus] = useState<string>("Not Started");
  const [verificationStatus, setVerificationStatus] = useState<string>("Unverified");
  const [remarks, setRemarks] = useState("");

  const save = trpc.credentials.create.useMutation({
    onSuccess: () => {
      toast.success("License added.");
      utils.credentials.list.invalidate();
      onOpenChange(false);
    },
    onError: (e) => toast.error(e.message),
  });
  const update = trpc.credentials.update.useMutation({
    onSuccess: () => {
      toast.success("License updated.");
      utils.credentials.list.invalidate();
      onOpenChange(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const reset = () => {
    if (current) {
      setSelectedNurse(current.nurseId);
      setSelectedType(String(current.credentialTypeId));
      setLicenseNumber(current.licenseNumber ?? "");
      setIssueDate(current.issueDate ? safeDateKey(current.issueDate) : "");
      setExpiryDate(safeDateKey(current.expiryDate));
      setRenewalStatus(current.renewalStatus ?? "Not Started");
      setVerificationStatus(current.verificationStatus ?? "Unverified");
      setRemarks(current.remarks ?? "");
    } else {
      setSelectedNurse(nurseId ?? 0);
      setSelectedType("");
      setLicenseNumber("");
      setIssueDate("");
      setExpiryDate("");
      setRenewalStatus("Not Started");
      setVerificationStatus("Unverified");
      setRemarks("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onOpenChange(false); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editId ? "Edit License" : "Add License"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          {!editId && (
            <div>
              <Label className="mb-1 block">Nurse *</Label>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={selectedNurse}
                onChange={(e) => setSelectedNurse(Number(e.target.value))}
              >
                <option value={0} disabled>Choose a nurse…</option>
                {(nurses ?? []).map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.firstName} {n.lastName} ({n.employeeId})
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <Label className="mb-1 block">Credential Type *</Label>
            <select
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
            >
              <option value="" disabled>Choose a type…</option>
              {(types ?? []).map((t) => (
                <option key={t.id} value={t.id}>{t.name}{t.issuingOrganizationDefault ? ` — ${t.issuingOrganizationDefault}` : ""}</option>
              ))}
            </select>
          </div>
          <div>
            <Label className="mb-1 block">License Number</Label>
            <Input value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)} placeholder="e.g., 0123456" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="mb-1 block">Issue Date</Label>
              <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
            </div>
            <div>
              <Label className="mb-1 block">Expiry Date *</Label>
              <Input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="mb-1 block">Renewal Status</Label>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={renewalStatus}
                onChange={(e) => setRenewalStatus(e.target.value)}
              >
                {RENEWAL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <Label className="mb-1 block">Verification</Label>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={verificationStatus}
                onChange={(e) => setVerificationStatus(e.target.value)}
              >
                {VERIFICATION_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div>
            <Label className="mb-1 block">Remarks</Label>
            <Input value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Optional notes" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button
              disabled={save.isPending || update.isPending || !expiryDate || (!editId && (!selectedNurse || !selectedType))}
              onClick={() => {
                if (editId) {
                  update.mutate({
                    id: editId,
                    licenseNumber: licenseNumber || undefined,
                    issueDate: issueDate ? new Date(issueDate) : undefined,
                    expiryDate: new Date(expiryDate),
                    renewalStatus: renewalStatus as typeof RENEWAL_STATUSES[number],
                    verificationStatus: verificationStatus as typeof VERIFICATION_STATUSES[number],
                    remarks: remarks || undefined,
                  });
                } else {
                  save.mutate({
                    nurseId: selectedNurse,
                    credentialTypeId: Number(selectedType),
                    licenseNumber: licenseNumber || undefined,
                    issueDate: issueDate ? new Date(issueDate) : undefined,
                    expiryDate: new Date(expiryDate),
                    renewalStatus: renewalStatus as typeof RENEWAL_STATUSES[number],
                    verificationStatus: verificationStatus as typeof VERIFICATION_STATUSES[number],
                    remarks: remarks || undefined,
                  });
                }
              }}
            >
              {editId ? "Save Changes" : "Add License"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RenewDialog({
  open,
  credentialId,
  onOpenChange,
}: {
  open: boolean;
  credentialId: number;
  onOpenChange: (v: boolean) => void;
}) {
  const utils = trpc.useUtils();
  const today = new Date().toISOString().slice(0, 10);
  const [newIssueDate, setNewIssueDate] = useState(today);
  const [newExpiryDate, setNewExpiryDate] = useState("");
  const [remarks, setRemarks] = useState("");

  const renew = trpc.credentials.markRenewed.useMutation({
    onSuccess: () => {
      toast.success("License renewed. New record created with a fresh cycle.");
      utils.credentials.list.invalidate();
      utils.calendar.listEvents.invalidate();
      onOpenChange(false);
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Mark License as Renewed</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          A new license record will be created with a fresh renewal cycle and this record will be marked Renewed — the history of both records is preserved.
        </p>
        <div className="grid gap-4">
          <div>
            <Label className="mb-1 block">Renewal Issue Date *</Label>
            <Input type="date" value={newIssueDate} onChange={(e) => setNewIssueDate(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1 block">New Expiry Date *</Label>
            <Input type="date" value={newExpiryDate} onChange={(e) => setNewExpiryDate(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1 block">Remarks</Label>
            <Input value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Optional notes" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button
              disabled={renew.isPending || !newIssueDate || !newExpiryDate}
              onClick={() => {
                renew.mutate({
                  credentialId,
                  newIssueDate: new Date(newIssueDate),
                  newExpiryDate: new Date(newExpiryDate),
                  remarks: remarks || undefined,
                });
              }}
            >
              Mark Renewed
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
