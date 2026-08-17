import { AreaSelect } from "@/components/nursetrack/AreaSelect";
import { NurseAvatar } from "@/components/nursetrack/NurseAvatar";
import { EmploymentStatusBadge, LicenseStatusBadge } from "@/components/nursetrack/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { nurseFullName, EMPLOYMENT_STATUSES, formatDate as sharedFormatDate } from "../../../shared/nursetrack";
import { Archive, LayoutGrid, MapPin, Pencil, Plus, Search, Table2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { NurseFormDialog } from "./NurseFormDialog";
import { formatDate } from "../../../shared/nursetrack";

type View = "cards" | "table";
type SortKey = "name" | "employeeId" | "area" | "dateHired";

export default function Nurses() {
  const [view, setView] = useState<View>("cards");
  const [search, setSearch] = useState("");
  const [areaFilter, setAreaFilter] = useState("all");
  const [empFilter, setEmpFilter] = useState("all");
  const [licFilter, setLicFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [createOpen, setCreateOpen] = useState(false);
  const { data: nurses, isLoading } = trpc.nurses.list.useQuery();
  const { data: areas } = trpc.areas.list.useQuery();
  const [, navigate] = useLocation();

  const filtered = useMemo(() => {
    let rows = (nurses ?? []).filter((n) => !n.archivedAt);
    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (n) =>
          nurseFullName(n).toLowerCase().includes(q) ||
          n.employeeId.toLowerCase().includes(q),
      );
    }
    if (areaFilter !== "all") rows = rows.filter((n) => String(n.currentAreaId) === areaFilter);
    if (empFilter !== "all") rows = rows.filter((n) => n.employmentStatus === empFilter);
    if (licFilter !== "all") rows = rows.filter((n) => n.licenseStatus === licFilter);
    const areaName = new Map((areas ?? []).map((a) => [a.id, a.name]));
    rows.sort((a, b) => {
      if (sortKey === "name") return nurseFullName(a).localeCompare(nurseFullName(b));
      if (sortKey === "employeeId") return a.employeeId.localeCompare(b.employeeId);
      if (sortKey === "area") return (areaName.get(a.currentAreaId ?? 0) ?? "").localeCompare(areaName.get(b.currentAreaId ?? 0) ?? "");
      const da = a.dateHired ? new Date(a.dateHired).getTime() : 0;
      const db_ = b.dateHired ? new Date(b.dateHired).getTime() : 0;
      return da - db_;
    });
    return rows;
  }, [nurses, search, areaFilter, empFilter, licFilter, sortKey, areas]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-32" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Nurses</h1>
          <p className="text-sm text-muted-foreground">{filtered.length} of {(nurses ?? []).length} active nurses</p>
        </div>
        <div className="flex items-center gap-2">
          <Tabs value={view} onValueChange={(v) => setView(v as View)}>
            <TabsList>
              <TabsTrigger value="cards" aria-label="Card view"><LayoutGrid className="h-4 w-4" /></TabsTrigger>
              <TabsTrigger value="table" aria-label="Table view"><Table2 className="h-4 w-4" /></TabsTrigger>
            </TabsList>
          </Tabs>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Add Nurse
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-56 max-w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search name or employee ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <AreaSelect value={areaFilter} onValueChange={setAreaFilter} placeholder="All areas" className="w-44" />
        <Select value={empFilter} onValueChange={setEmpFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Employment status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Employment status</SelectItem>
            {EMPLOYMENT_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={licFilter} onValueChange={setLicFilter}>
          <SelectTrigger className="w-44"><SelectValue placeholder="License status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">License status</SelectItem>
            {(["Expired", "Within 6 Months", "Within 1 Year", "Valid"] as const).map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
          <SelectTrigger className="w-32"><SelectValue placeholder="Sort" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="name">Name</SelectItem>
            <SelectItem value="employeeId">Employee ID</SelectItem>
            <SelectItem value="area">Area</SelectItem>
            <SelectItem value="dateHired">Date hired</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm text-muted-foreground mb-3">No nurses match your filters.</p>
            <Button variant="outline" onClick={() => { setSearch(""); setAreaFilter("all"); setEmpFilter("all"); setLicFilter("all"); }}>
              Clear filters
            </Button>
          </CardContent>
        </Card>
      ) : view === "cards" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((n) => (
            <NurseCard key={n.id} nurse={n} navigate={navigate} />
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-left">
                    <th className="px-4 py-3 font-medium">Nurse</th>
                    <th className="px-4 py-3 font-medium">Employee ID</th>
                    <th className="px-4 py-3 font-medium">Position</th>
                    <th className="px-4 py-3 font-medium">Current Area</th>
                    <th className="px-4 py-3 font-medium">Date Hired</th>
                    <th className="px-4 py-3 font-medium">Employment</th>
                    <th className="px-4 py-3 font-medium">License Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map((n) => (
                    <tr
                      key={n.id}
                      onClick={() => navigate(`/nurses/${n.id}`)}
                      className="cursor-pointer hover:bg-accent/50 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <NurseAvatar nurse={n} size="sm" />
                          <div>
                            <p className="font-medium leading-tight">{nurseFullName(n)}</p>
                            {n.suffix && <p className="text-xs text-muted-foreground">{n.suffix}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{n.employeeId}</td>
                      <td className="px-4 py-3 text-muted-foreground">{n.position ?? "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{n.currentArea?.name ?? "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{sharedFormatDate(n.dateHired)}</td>
                      <td className="px-4 py-3"><EmploymentStatusBadge status={n.employmentStatus ?? "Active"} /></td>
                      <td className="px-4 py-3">{n.licenseStatus ? <LicenseStatusBadge status={n.licenseStatus as never} /> : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <NurseFormDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

function NurseCard({
  nurse,
  navigate,
}: {
  nurse: {
    id: number;
    firstName: string;
    middleName?: string | null;
    lastName: string;
    suffix?: string | null;
    employeeId: string;
    position?: string | null;
    profilePhotoKey?: string | null;
    currentAreaId?: number | null;
    currentArea?: { name: string } | null;
    employmentStatus?: string | null;
    licenseStatus?: string | null;
    dateHired: Date | string | null;
    archivedAt?: Date | null;
  };
  navigate: (p: string) => void;
}) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="pt-5">
        <div className="flex items-start justify-between">
          <button
            onClick={() => navigate(`/nurses/${nurse.id}`)}
            className="flex items-center gap-3 min-w-0 text-left"
          >
            <NurseAvatar nurse={nurse} />
            <div className="min-w-0">
              <p className="font-medium truncate">{nurseFullName(nurse)}</p>
              <p className="text-xs text-muted-foreground font-mono">{nurse.employeeId}</p>
              <p className="text-xs text-muted-foreground truncate">{nurse.position ?? "Nurse"}</p>
            </div>
          </button>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/nurses/${nurse.id}?tab=edit`);
              }}
              aria-label="Edit nurse"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/nurses/${nurse.id}?archive=1`);
              }}
              aria-label="Archive nurse"
            >
              <Archive className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
          <MapPin className="h-3 w-3" />
          <span className="truncate">{nurse.currentArea?.name ?? "Unassigned"}</span>
        </div>
          <div className="mt-3 flex items-center justify-between">
          <EmploymentStatusBadge status={nurse.employmentStatus ?? "Active"} />
          {nurse.licenseStatus ? <LicenseStatusBadge status={nurse.licenseStatus as never} /> : "—"}
        </div>
      </CardContent>
    </Card>
  );
}
