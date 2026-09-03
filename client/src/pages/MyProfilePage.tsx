import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { startLogin } from "@/const";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { NurseAvatar } from "@/components/nursetrack/NurseAvatar";
import { FileUploadButton } from "@/components/nursetrack/FileUpload";
import { LicenseStatusBadge, TrainingStatusBadge } from "@/components/nursetrack/StatusBadge";
import { LICENSE_STATUS_META, nurseIdLabel, type LicenseStatus, formatDate } from "@shared/nursetrack";
import { toast } from "sonner";
import { FileCheck, LogOut, Plus, Upload, CheckCircle2 } from "lucide-react";

function StaffShell({ children }: { children: React.ReactNode }) {
  const { logout } = useAuth();
  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between px-6 py-4 border-b glass-panel">
        <div className="flex items-center gap-2.5">
          <img src="/branding/spmc-nephro-cluster.jpg" alt="" className="h-8 w-8 object-contain rounded-full bg-white shrink-0" />
          <span className="font-bold tracking-tight">NurseTrack</span>
        </div>
        <Button variant="ghost" size="sm" onClick={() => logout()}>
          <LogOut className="h-4 w-4 mr-1.5" />
          Sign out
        </Button>
      </header>
      <main className="flex-1 flex items-start justify-center p-4 md:p-8">
        <div className="w-full max-w-2xl">{children}</div>
      </main>
    </div>
  );
}

function LinkAccountForm() {
  const [prcNumber, setPrcNumber] = useState("");
  const [fullName, setFullName] = useState("");
  const utils = trpc.useUtils();
  const linkMutation = trpc.staffAccount.linkByPrc.useMutation({
    onSuccess: () => {
      toast.success("Linked! Loading your profile...");
      utils.staffAccount.myLink.invalidate();
      utils.staffAccount.myProfile.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <Card className="glass-card p-6 space-y-4">
      <div>
        <h1 className="text-xl font-bold">Link your account</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Your account isn't linked to a staff profile yet. Enter your PRC / license number and your full name
          exactly as your supervisor recorded it to link your Google account.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="prcNumber">PRC / License Number</Label>
        <Input id="prcNumber" value={prcNumber} onChange={(e) => setPrcNumber(e.target.value)} placeholder="e.g. 0123456" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="fullName">Full Name</Label>
        <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="e.g. Juan Dela Cruz" />
      </div>
      <Button
        className="w-full"
        disabled={!prcNumber.trim() || !fullName.trim() || linkMutation.isPending}
        onClick={() => linkMutation.mutate({ prcNumber: prcNumber.trim(), fullName: fullName.trim() })}
      >
        {linkMutation.isPending ? "Linking..." : "Link my account"}
      </Button>
      <p className="text-xs text-muted-foreground">
        Not working? Contact your supervisor to confirm your PRC number and name are on file.
      </p>
    </Card>
  );
}

function AddTrainingDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const utils = trpc.useUtils();
  const { data: catalog } = trpc.staffAccount.listCatalog.useQuery(undefined, { enabled: open });
  const [trainingId, setTrainingId] = useState("");
  const [provider, setProvider] = useState("");
  const [completionDate, setCompletionDate] = useState(new Date().toISOString().slice(0, 10));
  const [trainingHours, setTrainingHours] = useState("");
  const [cpdUnits, setCpdUnits] = useState("");
  const [certNumber, setCertNumber] = useState("");
  const [remarks, setRemarks] = useState("");

  const addMutation = trpc.staffAccount.addTrainingRecord.useMutation({
    onSuccess: () => {
      toast.success("Training completion recorded.");
      utils.staffAccount.myProfile.invalidate();
      onOpenChange(false);
      setTrainingId("");
      setProvider("");
      setTrainingHours("");
      setCpdUnits("");
      setCertNumber("");
      setRemarks("");
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Completed Training or Seminar</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Label className="mb-1 block">Training Topic *</Label>
            <Select value={trainingId} onValueChange={setTrainingId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select topic from catalog…" />
              </SelectTrigger>
              <SelectContent>
                {(catalog ?? []).map((item) => (
                  <SelectItem key={item.id} value={String(item.id)}>
                    {item.name} ({item.kind})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-1 block">Completion Date *</Label>
            <Input
              type="date"
              value={completionDate}
              onChange={(e) => setCompletionDate(e.target.value)}
            />
          </div>
          <div>
            <Label className="mb-1 block">Training Provider</Label>
            <Input
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              placeholder="e.g. SPMC / DOH / PRC"
            />
          </div>
          <div>
            <Label className="mb-1 block">Training Hours</Label>
            <Input
              type="number"
              min={1}
              value={trainingHours}
              onChange={(e) => setTrainingHours(e.target.value)}
              placeholder="e.g. 8"
            />
          </div>
          <div>
            <Label className="mb-1 block">CPD Units</Label>
            <Input
              type="number"
              min={0}
              value={cpdUnits}
              onChange={(e) => setCpdUnits(e.target.value)}
              placeholder="e.g. 5"
            />
          </div>
          <div className="col-span-2">
            <Label className="mb-1 block">Certificate Number</Label>
            <Input
              value={certNumber}
              onChange={(e) => setCertNumber(e.target.value)}
              placeholder="e.g. CERT-2026-001"
            />
          </div>
          <div className="col-span-2">
            <Label className="mb-1 block">Remarks / Notes</Label>
            <Textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Optional notes or details…"
            />
          </div>
          <div className="col-span-2 flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button
              disabled={!trainingId || !completionDate || addMutation.isPending}
              onClick={() => {
                addMutation.mutate({
                  trainingId: Number(trainingId),
                  completionDate,
                  provider: provider.trim() || undefined,
                  trainingHours: trainingHours ? Number(trainingHours) : undefined,
                  cpdUnits: cpdUnits ? Number(cpdUnits) : undefined,
                  certificateNumber: certNumber.trim() || undefined,
                  remarks: remarks.trim() || undefined,
                });
              }}
            >
              {addMutation.isPending ? "Saving..." : "Save Record"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MyProfileView() {
  const { data: profile, isLoading } = trpc.staffAccount.myProfile.useQuery();
  const utils = trpc.useUtils();
  const [contactNumber, setContactNumber] = useState<string | null>(null);
  const [trainingDialogOpen, setTrainingDialogOpen] = useState(false);

  const saveMutation = trpc.staffAccount.updateMyBasicInfo.useMutation({
    onSuccess: () => {
      toast.success("Contact info saved.");
      utils.staffAccount.myProfile.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });
  const photoMutation = trpc.staffAccount.uploadMyPhoto.useMutation({
    onSuccess: () => {
      toast.success("Profile photo updated.");
      utils.staffAccount.myProfile.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });
  const credDocMutation = trpc.staffAccount.uploadCredentialDocument.useMutation({
    onSuccess: () => {
      toast.success("License document uploaded.");
      utils.staffAccount.myProfile.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });
  const certUploadMutation = trpc.staffAccount.uploadTrainingCertificate.useMutation({
    onSuccess: () => {
      toast.success("Training certificate uploaded.");
      utils.staffAccount.myProfile.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  if (isLoading || !profile) {
    return (
      <Card className="glass-card p-6 space-y-4">
        <Skeleton className="h-20 w-20 rounded-full" />
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-32" />
      </Card>
    );
  }

  const currentContact = contactNumber ?? profile.contactNumber ?? "";

  return (
    <div className="space-y-4">
      <Card className="glass-card p-6">
        <div className="flex items-center gap-4">
          <div className="relative">
            <NurseAvatar nurse={profile} size="xl" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold truncate">
              {profile.firstName} {profile.middleName ? `${profile.middleName} ` : ""}{profile.lastName} {profile.suffix ?? ""}
            </h1>
            <p className="text-sm text-muted-foreground">{nurseIdLabel(profile)} &middot; {profile.position || profile.staffType}</p>
            <p className="text-sm text-muted-foreground">{profile.currentArea?.name ?? "Unassigned"}</p>
          </div>
        </div>
        <div className="mt-4">
          <FileUploadButton
            kind="photo"
            label="Change photo"
            disabled={photoMutation.isPending}
            onFile={(file) => photoMutation.mutate(file)}
          />
        </div>
      </Card>

      <Card className="glass-card p-6 space-y-3">
        <h2 className="font-semibold">License</h2>
        <div className="flex items-center gap-2">
          {profile.licenseStatus ? <LicenseStatusBadge status={profile.licenseStatus as never} /> : <Badge variant="outline">No license on file</Badge>}
          {profile.licenseNumber ? <span className="text-sm text-muted-foreground font-mono">{profile.licenseNumber}</span> : null}
        </div>
      </Card>

      <Card className="glass-card p-6 space-y-3">
        <h2 className="font-semibold">Contact number</h2>
        <div className="flex gap-2">
          <Input
            value={currentContact}
            onChange={(e) => setContactNumber(e.target.value)}
            placeholder="e.g. 09171234567"
          />
          <Button
            disabled={saveMutation.isPending || currentContact === (profile.contactNumber ?? "")}
            onClick={() => saveMutation.mutate({ contactNumber: currentContact || undefined })}
          >
            {saveMutation.isPending ? "Saving..." : "Save"}
          </Button>
        </div>
      </Card>

      <Card className="glass-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Licenses & Credentials</h2>
        </div>
        {profile.credentials.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">No credentials recorded.</p>
        ) : (
          <div className="space-y-3">
            {profile.credentials.map((c) => (
              <div key={c.id} className="p-3 border rounded-lg bg-card/40 flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1 min-w-48">
                  <div className="font-medium text-sm">{c.typeName}</div>
                  <div className="text-xs text-muted-foreground">
                    Number: <span className="font-mono">{c.licenseNumber || "—"}</span> &middot; Expires: {formatDate(c.expiryDate)}
                  </div>
                  {c.documentKey && (
                    <div className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      <span>Document verified & on file</span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <FileUploadButton
                    kind="document"
                    label={c.documentKey ? "Replace Document" : "Upload Document"}
                    disabled={credDocMutation.isPending}
                    onFile={(f) => credDocMutation.mutate({ credentialId: c.id, ...f })}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="glass-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Trainings & Seminars</h2>
          <Button size="sm" variant="outline" onClick={() => setTrainingDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Add Training
          </Button>
        </div>
        {profile.trainings.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">No training records on file yet.</p>
        ) : (
          <div className="space-y-3">
            {profile.trainings.map((t) => (
              <div key={t.id} className="p-3 border rounded-lg bg-card/40 flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1 min-w-48">
                  <div className="font-medium text-sm">{t.trainingName}</div>
                  <div className="text-xs text-muted-foreground">
                    {t.provider ? `${t.provider} · ` : ""}Completed: {formatDate(t.completionDate)}
                  </div>
                  <div className="flex items-center gap-2 pt-0.5">
                    <TrainingStatusBadge status={t.status} />
                    {t.certificateKey && (
                      <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                        <CheckCircle2 className="h-3 w-3" /> Certificate on file
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <FileUploadButton
                    kind="document"
                    label={t.certificateKey ? "Replace Certificate" : "Upload Certificate"}
                    disabled={certUploadMutation.isPending}
                    onFile={(f) => certUploadMutation.mutate({ recordId: t.id, ...f })}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <AddTrainingDialog open={trainingDialogOpen} onOpenChange={setTrainingDialogOpen} />
    </div>
  );
}

export default function MyProfilePage() {
  const { user, loading } = useAuth();
  const { data: link, isLoading: linkLoading } = trpc.staffAccount.myLink.useQuery(undefined, { enabled: Boolean(user) });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Skeleton className="h-40 w-full max-w-2xl mx-4" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <div className="auth-welcome-panel flex flex-col items-center gap-8 p-8 max-w-md w-full">
          <div className="flex flex-col items-center gap-6">
            <img src="/branding/spmc-nephro-cluster.jpg" alt="" className="h-20 w-20 object-contain rounded-full bg-white" />
            <h1 className="text-3xl font-bold tracking-tight text-center">SKTI NurseTrack</h1>
            <p className="text-base text-muted-foreground text-center max-w-sm">Sign in to view your staff profile.</p>
          </div>
          <Button onClick={() => startLogin()} size="lg" className="w-full text-base py-6 shadow-lg hover:shadow-xl transition-all">
            Sign in with Google
          </Button>
        </div>
      </div>
    );
  }

  return (
    <StaffShell>
      {linkLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : link?.linked ? (
        <MyProfileView />
      ) : (
        <LinkAccountForm />
      )}
    </StaffShell>
  );
}
