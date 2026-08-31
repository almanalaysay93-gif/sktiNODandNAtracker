import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { formatDate, STAFF_TYPES } from "../../../shared/nursetrack";
import { useMemo, useState } from "react";
import { useLocation } from "wouter";

export default function TrainingMatrix() {
  const [, navigate] = useLocation();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [staffType, setStaffType] = useState("all");
  const [areaFilter, setAreaFilter] = useState("all");
  const { data: areas } = trpc.areas.list.useQuery();
  const { data, isLoading } = trpc.seminars.matrix.useQuery({
    from: from || undefined,
    to: to || undefined,
    staffType: staffType === "all" ? undefined : staffType as (typeof STAFF_TYPES)[number],
    areaId: areaFilter === "all" ? undefined : Number(areaFilter),
  });

  const recordByCell = useMemo(() => {
    const map = new Map<string, (typeof data extends { records: infer R } ? R : never) extends (infer T)[] ? T : never>();
    for (const record of data?.records ?? []) {
      if (!record.eventId) continue;
      const key = `${record.nurseId}:${record.eventId}`;
      const current = map.get(key) as { completionDate?: Date | string | null; scheduledDate?: Date | string | null } | undefined;
      const recordDate = String(record.completionDate ?? record.scheduledDate ?? "");
      const currentDate = String(current?.completionDate ?? current?.scheduledDate ?? "");
      if (!current || recordDate > currentDate) map.set(key, record as never);
    }
    return map;
  }, [data]);

  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle className="text-base">Training Matrix</CardTitle>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} aria-label="From date" />
          <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} aria-label="To date" />
          <Select value={staffType} onValueChange={setStaffType}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All staff types</SelectItem>
              {STAFF_TYPES.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={areaFilter} onValueChange={setAreaFilter}>
            <SelectTrigger><SelectValue placeholder="All areas" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All areas</SelectItem>
              {areas?.map((a) => <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? <Skeleton className="h-72 w-full" /> : !data?.events.length ? (
          <p className="py-12 text-center text-sm text-muted-foreground">No seminar occurrences match these dates.</p>
        ) : (
          <div className="max-h-[65vh] overflow-auto rounded-md border">
            <table className="min-w-max text-xs">
              <thead className="sticky top-0 z-20 bg-background">
                <tr>
                  <th className="sticky left-0 z-30 min-w-52 border-b border-r bg-background px-3 py-2 text-left">Staff</th>
                  {data.events.map(({ event, training }) => (
                    <th key={event.id} className="max-w-40 border-b border-r px-3 py-2 text-left align-bottom">
                      <button className="font-medium text-primary hover:underline" onClick={() => navigate(`/seminars/${event.id}`)}>
                        {training.name}
                      </button>
                      <div className="mt-1 font-normal text-muted-foreground">{formatDate(event.startDate)}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.staff.map((person) => (
                  <tr key={person.id} className="border-b">
                    <td className="sticky left-0 z-10 border-r bg-background px-3 py-2 font-medium">{person.name}</td>
                    {data.events.map(({ event }) => {
                      const record = recordByCell.get(`${person.id}:${event.id}`) as { status?: string; completionDate?: Date | string | null; scheduledDate?: Date | string | null; participationRole?: string } | undefined;
                      return (
                        <td key={event.id} className="border-r px-3 py-2 text-center">
                          {record ? (
                            <span title={record.participationRole}>{record.status === "Completed" || record.status === "Expired" ? formatDate(record.completionDate) : record.status}</span>
                          ) : <span className="text-muted-foreground">Missing</span>}
                        </td>
                      );
                    })}
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
