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
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { nurseFullName, nurseIdLabel, EMPLOYMENT_STATUSES, STAFF_TYPES, formatDate as sharedFormatDate } from "../../../shared/nursetrack";
import { Archive, LayoutGrid, MapPin, Pencil, Plus, Search, Table2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useLocation, useSearch } from "wouter";
import { NurseFormDialog } from "./NurseFormDialog";
import { formatDate } from "../../../shared/nursetrack";

type View = "cards" | "table";
type SortKey = "name" | "employeeId" | "area" | "dateHired";

export default function Nurses() {
  const [view, setView] = useState<View>("cards");
  const [search, setSearch] = useState("");
  const [areaFilter, setAreaFilter] = useState("");
  const [empFilter, setEmpFilter] = useState("all");
  const [licFilter, setLicFilter] = useState("all");
  const search_ = useSearch();
  const [staffTypeFilter, setStaffTypeFilter] = useState("all");
  useEffect(() => {
    const type = new URLSearchParams(search_).get("type");
    setStaffTypeFilter(type && (STAFF_TYPES as readonly string[]).includes(type) ? type : "all");
  }, [search_]);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [createOpen, setCreateOpen] = useState(false);
  const [createStaffType, setCreateStaffType] = useState<(typeof STAFF_TYPES)[number]>("Registered Nurse");
  // Single round-trip: server merges nurses + areas.
  const { data: initial, isLoading } = trpc.nurses.initial.useQuery();
  const nurses = initial?.nurses;
  const areas = initial?.areas;
  const [, navigate] = useLocation();

  const filtered = useMemo(() => {
    let rows = (nurses ?? []).filter((n) => !n.archivedAt);
    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (n) =>
          nurseFullName(n).toLowerCase().includes(q) ||
          n.employeeId.toLowerCase().includes(q) ||
          (n.licenseNumber ?? "").toLowerCase().includes(q),
      );
    }
    if (areaFilter !== "") rows = rows.filter((n) => String(n.currentAreaId) === areaFilter);
    if (empFilter !== "all") rows = rows.filter((n) => n.employmentStatus === empFilter);
    if (licFilter !== "all") rows = rows.filter((n) => n.licenseStatus === licFilter);
    if (staffTypeFilter !== "all") rows = rows.filter((n) => n.staffType === staffTypeFilter);
    const areaName = new Map((areas ?? []).map((a) => [a.id, a.name]));
    rows.sort((a, b) => {
      if (sortKey === "name") return nurseFullName(a).localeCompare(nurseFullName(b));
      if (sortKey === "employeeId") return nurseIdLabel(a).localeCompare(nurseIdLabel(b));
      if (sortKey === "area") return (areaName.get(a.currentAreaId ?? 0) ?? "").localeCompare(areaName.get(b.currentAreaId ?? 0) ?? "");
      const da = a.dateHired ? new Date(a.dateHired).getTime() : 0;
      const db_ = b.dateHired ? new Date(b.dateHired).getTime() : 0;
      return da - db_;
    });
    return rows;
  }, [nurses, search, areaFilter, empFilter, licFilter, staffTypeFilter, sortKey, areas]);

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
          <h1 className="text-2xl font-semibold tracking-tight">
            {staffTypeFilter === "Nursing Attendant"
              ? "Nursing Attendants"
              : staffTypeFilter === "Registered Nurse"
              ? "Registered Nurses"
              : "Nurses"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {filtered.length} of {(nurses ?? []).length}{" "}
            {staffTypeFilter === "Nursing Attendant" ? "nursing attendants" : "nurses & personnel"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Tabs value={view} onValueChange={(v) => setView(v as View)}>
            <TabsList>
              <TabsTrigger value="cards" aria-label="Card view"><LayoutGrid className="h-4 w-4" /></TabsTrigger>
              <TabsTrigger value="table" aria-label="Table view"><Table2 className="h-4 w-4" /></TabsTrigger>
            </TabsList>
          </Tabs>
          <Button onClick={() => { setCreateStaffType("Registered Nurse"); setCreateOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" />
            Add Nurse
          </Button>
          <Button variant="outline" onClick={() => { setCreateStaffType("Nursing Attendant"); setCreateOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" />
            Add Nursing Attendant
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
        <Select value={staffTypeFilter} onValueChange={setStaffTypeFilter}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Staff type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Staff type</SelectItem>
            {STAFF_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
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
            <SelectItem value="employeeId">License Number</SelectItem>
            <SelectItem value="area">Area</SelectItem>
            <SelectItem value="dateHired">Date hired</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <Card className="glass-card">
          <CardContent className="py-12 text-center">
            <p className="text-sm text-muted-foreground mb-3">No nurses match your filters.</p>
            <Button variant="outline" onClick={() => { setSearch(""); setAreaFilter(""); setEmpFilter("all"); setLicFilter("all"); setStaffTypeFilter("all"); }}>
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
              <Card className="glass-card">
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nurse</TableHead>
                        <TableHead>License Number</TableHead>
                        <TableHead>Position</TableHead>
                        <TableHead>Current Area</TableHead>
                        <TableHead>Date Hired</TableHead>
                        <TableHead>Employment</TableHead>
                        <TableHead>License Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((n) => (
                        <TableRow
                          key={n.id}
                          onClick={() => navigate(`/nurses/${n.id}`)}
                          className="cursor-pointer"
                        >
                          <TableCell>
                            <div className="flex items-center gap-2.5">
                              <NurseAvatar nurse={n} size="sm" />
                              <div>
                                <p className="font-medium leading-tight">{nurseFullName(n)}</p>
                                {n.suffix && <p className="text-xs text-muted-foreground">{n.suffix}</p>}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-xs">{nurseIdLabel(n)}</TableCell>
                          <TableCell className="text-muted-foreground">{n.position ?? "—"}</TableCell>
                          <TableCell className="text-muted-foreground">{n.currentArea?.name ?? "—"}</TableCell>
                          <TableCell className="text-muted-foreground">{sharedFormatDate(n.dateHired)}</TableCell>
                          <TableCell><EmploymentStatusBadge status={n.employmentStatus ?? "Active"} /></TableCell>
                          <TableCell>{n.licenseStatus ? <LicenseStatusBadge status={n.licenseStatus as never} /> : "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

      <NurseFormDialog open={createOpen} onOpenChange={setCreateOpen} defaultStaffType={createStaffType} />
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
    licenseNumber?: string | null;
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
    <Card className="glass-card hover-shadow-none ">
      <CardContent className="pt-5">
        <div className="flex items-start justify-between">
          <button
            onClick={() => navigate(`/nurses/${nurse.id}`)}
            className="flex items-center gap-3 min-w-0 text-left"
          >
            <NurseAvatar nurse={nurse} />
            <div className="min-w-0">
              <p className="font-medium truncate">{nurseFullName(nurse)}</p>
              <p className="text-xs text-muted-foreground font-mono">{nurseIdLabel(nurse)}</p>
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
