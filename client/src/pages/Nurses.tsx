import { AreaSelect } from "@/components/nursetrack/AreaSelect";
import { NurseAvatar } from "@/components/nursetrack/NurseAvatar";
import { EmploymentStatusBadge, LicenseStatusBadge } from "@/components/nursetrack/StatusBadge";
import { Badge } from "@/components/ui/badge";
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
import { Archive, LayoutGrid, MapPin, Pencil, Plus, Search, Table2, UserCheck, Users } from "lucide-react";
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
  const [staffTypeFilter, setStaffTypeFilter] = useState<string>("Registered Nurse");
  const [, navigate] = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(search_);
    const type = params.get("type");
    if (type === "all") {
      setStaffTypeFilter("all");
    } else if (type && (STAFF_TYPES as readonly string[]).includes(type)) {
      setStaffTypeFilter(type);
    } else {
      setStaffTypeFilter("Registered Nurse");
    }
  }, [search_]);

  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [createOpen, setCreateOpen] = useState(false);
  const [createStaffType, setCreateStaffType] = useState<(typeof STAFF_TYPES)[number]>("Registered Nurse");
  // Single round-trip: server merges nurses + areas.
  const { data: initial, isLoading } = trpc.nurses.initial.useQuery();
  const nurses = initial?.nurses;
  const areas = initial?.areas;

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

  const counts = useMemo(() => {
    const all = (nurses ?? []).filter((n) => !n.archivedAt);
    const rn = all.filter((n) => n.staffType === "Registered Nurse").length;
    const na = all.filter((n) => n.staffType === "Nursing Attendant").length;
    return { all: all.length, rn, na };
  }, [nurses]);

  return (
    <div className="space-y-5">
      {/* Primary Category Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-4">
        <Tabs
          value={staffTypeFilter}
          onValueChange={(val) => {
            setStaffTypeFilter(val);
            if (val === "Registered Nurse") navigate("/nurses?type=Registered%20Nurse");
            else if (val === "Nursing Attendant") navigate("/nurses?type=Nursing%20Attendant");
            else navigate("/nurses?type=all");
          }}
          className="w-full sm:w-auto"
        >
          <TabsList className="h-11 p-1 bg-muted/70">
            <TabsTrigger value="Registered Nurse" className="px-4 py-2 text-sm font-semibold gap-2">
              <Users className="h-4 w-4 text-primary" />
              <span>Registered Nurses (NOD)</span>
              <Badge variant="secondary" className="px-1.5 py-0.5 text-xs font-mono">
                {counts.rn}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="Nursing Attendant" className="px-4 py-2 text-sm font-semibold gap-2">
              <UserCheck className="h-4 w-4 text-amber-500" />
              <span>Nursing Attendants (NA)</span>
              <Badge variant="secondary" className="px-1.5 py-0.5 text-xs font-mono">
                {counts.na}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="all" className="px-4 py-2 text-sm font-semibold gap-2">
              <span>All Personnel</span>
              <Badge variant="secondary" className="px-1.5 py-0.5 text-xs font-mono">
                {counts.all}
              </Badge>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2">
          <Tabs value={view} onValueChange={(v) => setView(v as View)}>
            <TabsList>
              <TabsTrigger value="cards" aria-label="Card view"><LayoutGrid className="h-4 w-4" /></TabsTrigger>
              <TabsTrigger value="table" aria-label="Table view"><Table2 className="h-4 w-4" /></TabsTrigger>
            </TabsList>
          </Tabs>
          {staffTypeFilter === "Nursing Attendant" ? (
            <Button onClick={() => { setCreateStaffType("Nursing Attendant"); setCreateOpen(true); }}>
              <Plus className="h-4 w-4 mr-1" />
              Add Nursing Attendant
            </Button>
          ) : (
            <Button onClick={() => { setCreateStaffType("Registered Nurse"); setCreateOpen(true); }}>
              <Plus className="h-4 w-4 mr-1" />
              Add Nurse
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {staffTypeFilter === "Nursing Attendant"
              ? "Nursing Attendants (NA)"
              : staffTypeFilter === "Registered Nurse"
              ? "Registered Nurses (NOD)"
              : "All Personnel Roster"}
          </h1>
          <p className="text-sm text-muted-foreground">
            Showing {filtered.length} of {staffTypeFilter === "Nursing Attendant" ? counts.na : staffTypeFilter === "Registered Nurse" ? counts.rn : counts.all}{" "}
            {staffTypeFilter === "Nursing Attendant" ? "nursing attendants" : staffTypeFilter === "Registered Nurse" ? "registered nurses" : "staff members"}
          </p>
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
            <SelectItem value="employeeId">License Number</SelectItem>
            <SelectItem value="area">Area</SelectItem>
            <SelectItem value="dateHired">Date hired</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <Card className="glass-card">
          <CardContent className="py-12 text-center">
            <p className="text-sm text-muted-foreground mb-3">No staff members match your filters.</p>
            <Button variant="outline" onClick={() => { setSearch(""); setAreaFilter(""); setEmpFilter("all"); setLicFilter("all"); }}>
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
                      <TableRow className="border-b-2">
                        <TableHead className="text-sm font-bold uppercase tracking-wider py-4">Nurse / Staff</TableHead>
                        <TableHead className="text-sm font-bold uppercase tracking-wider py-4">Staff Type</TableHead>
                        <TableHead className="text-sm font-bold uppercase tracking-wider py-4">License / ID Number</TableHead>
                        <TableHead className="text-sm font-bold uppercase tracking-wider py-4">Position</TableHead>
                        <TableHead className="text-sm font-bold uppercase tracking-wider py-4">Current Area</TableHead>
                        <TableHead className="text-sm font-bold uppercase tracking-wider py-4">Date Hired</TableHead>
                        <TableHead className="text-sm font-bold uppercase tracking-wider py-4">Employment</TableHead>
                        <TableHead className="text-sm font-bold uppercase tracking-wider py-4">License Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((n) => (
                        <TableRow
                          key={n.id}
                          onClick={() => navigate(`/nurses/${n.id}`)}
                          className="cursor-pointer hover:bg-primary/5 py-2"
                        >
                          <TableCell className="py-3.5">
                            <div className="flex items-center gap-3">
                              <NurseAvatar nurse={n} size="md" />
                              <div>
                                <p className="font-bold text-lg leading-tight text-foreground">{nurseFullName(n)}</p>
                                {n.suffix && <p className="text-xs text-muted-foreground">{n.suffix}</p>}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            {n.staffType === "Nursing Attendant" ? (
                              <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 font-medium">
                                NA
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/20 font-medium">
                                RN (NOD)
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="font-mono text-sm font-semibold">{nurseIdLabel(n)}</TableCell>
                          <TableCell className="text-base font-medium text-foreground/90">{n.position ?? "—"}</TableCell>
                          <TableCell className="text-base font-medium text-foreground/90">{n.currentArea?.name ?? "—"}</TableCell>
                          <TableCell className="text-sm font-medium text-muted-foreground">{sharedFormatDate(n.dateHired)}</TableCell>
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
    staffType?: string | null;
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
    <Card className="glass-card hover-shadow-none">
      <CardContent className="pt-6 pb-5 px-6">
        <div className="flex items-start justify-between gap-3">
          <button
            onClick={() => navigate(`/nurses/${nurse.id}`)}
            className="flex items-center gap-4 min-w-0 text-left group"
          >
            <NurseAvatar nurse={nurse} size="lg" className="shrink-0 ring-2 ring-primary/20 group-hover:ring-primary/40 transition-all" />
            <div className="min-w-0">
              <p className="font-bold text-xl md:text-2xl text-foreground truncate tracking-tight group-hover:text-primary transition-colors">
                {nurseFullName(nurse)}
              </p>
              <p className="text-sm font-semibold text-muted-foreground font-mono mt-0.5">{nurseIdLabel(nurse)}</p>
              <p className="text-sm font-medium text-foreground/80 truncate mt-0.5">{nurse.position ?? "Nurse"}</p>
            </div>
          </button>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0"
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/nurses/${nurse.id}?tab=edit`);
              }}
              aria-label="Edit nurse"
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/nurses/${nurse.id}?archive=1`);
              }}
              aria-label="Archive nurse"
            >
              <Archive className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between gap-2 text-sm font-medium text-foreground/85">
          <div className="flex items-center gap-2 truncate">
            <MapPin className="h-4 w-4 text-primary shrink-0" />
            <span className="truncate">{nurse.currentArea?.name ?? "Unassigned"}</span>
          </div>
          {nurse.staffType === "Nursing Attendant" ? (
            <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 shrink-0 font-semibold">
              NA
            </Badge>
          ) : (
            <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/20 shrink-0 font-semibold">
              RN (NOD)
            </Badge>
          )}
        </div>
        <div className="mt-4 pt-3 border-t border-border/40 flex items-center justify-between">
          <EmploymentStatusBadge status={nurse.employmentStatus ?? "Active"} />
          {nurse.licenseStatus ? <LicenseStatusBadge status={nurse.licenseStatus as never} /> : "—"}
        </div>
      </CardContent>
    </Card>
  );
}

