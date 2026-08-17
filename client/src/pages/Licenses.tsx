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
import { CalendarCheck, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

const RENEWAL_STATUSES = ["Not Started", "Renewal In Progress", "Submitted", "Renewed"] as const;
const VERIFICATION_STATUSES = ["Unverified", "Pending Verification", "Verified"] as const;

export default function Licenses() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const { data: credentials, isLoading } = trpc.credentials.list.useQuery();
  const { data: nurses } = trpc.nurses.list.useQuery({ archived: false });
  const { data: types } = trpc.credentials.listTypes.useQuery();

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");

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
      </div>

      <Card>
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
                          <FileUploadButton
                            kind="document"
                            label="Upload"
                            onFile={(f) => utils.client.credentials.uploadDocument.mutate({ credentialId: c.id, ...f })}
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

      <Card>
        <CardContent className="pt-5 flex items-center gap-2 text-sm text-muted-foreground">
          <CalendarCheck className="h-4 w-4" />
          Licenses expiring within 12 months trigger automatic daily reminders. Upload documents to keep the registry complete.
        </CardContent>
      </Card>
    </div>
  );
}
