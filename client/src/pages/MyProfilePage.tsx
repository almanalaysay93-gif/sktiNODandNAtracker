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
import { NurseAvatar } from "@/components/nursetrack/NurseAvatar";
import { FileUploadButton } from "@/components/nursetrack/FileUpload";
import { LICENSE_STATUS_META, nurseIdLabel, type LicenseStatus } from "@shared/nursetrack";
import { toast } from "sonner";
import { LogOut } from "lucide-react";

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

function MyProfileView() {
  const { data: profile, isLoading } = trpc.staffAccount.myProfile.useQuery();
  const utils = trpc.useUtils();
  const [contactNumber, setContactNumber] = useState<string | null>(null);

  const saveMutation = trpc.staffAccount.updateMyBasicInfo.useMutation({
    onSuccess: () => {
      toast.success("Saved.");
      utils.staffAccount.myProfile.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });
  const photoMutation = trpc.staffAccount.uploadMyPhoto.useMutation({
    onSuccess: () => {
      toast.success("Photo updated.");
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

  const statusMeta = profile.licenseStatus ? LICENSE_STATUS_META[profile.licenseStatus as LicenseStatus] : null;
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
          {statusMeta ? <Badge variant="outline">{statusMeta.label}</Badge> : <Badge variant="outline">No license on file</Badge>}
          {profile.licenseNumber ? <span className="text-sm text-muted-foreground">{profile.licenseNumber}</span> : null}
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
            Save
          </Button>
        </div>
      </Card>

      {profile.credentials.length > 0 && (
        <Card className="glass-card p-6 space-y-3">
          <h2 className="font-semibold">Credentials</h2>
          <div className="space-y-2">
            {profile.credentials.map((c) => (
              <div key={c.id} className="flex items-center justify-between text-sm border-b last:border-0 pb-2 last:pb-0">
                <span>{c.licenseNumber || "—"}</span>
                <span className="text-muted-foreground">{c.expiryDate ? String(c.expiryDate).slice(0, 10) : "—"}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {profile.trainings.length > 0 && (
        <Card className="glass-card p-6 space-y-3">
          <h2 className="font-semibold">Trainings</h2>
          <div className="space-y-2">
            {profile.trainings.map((t) => (
              <div key={t.id} className="flex items-center justify-between text-sm border-b last:border-0 pb-2 last:pb-0">
                <span>{t.status}</span>
                <span className="text-muted-foreground">{t.completionDate ? String(t.completionDate).slice(0, 10) : "—"}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
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
