import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { CalendarPlus, MapPin, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

type EventType = "license" | "training" | "areaChange" | "custom";

const TYPE_LABELS: Record<EventType, string> = {
  license: "License",
  training: "Training",
  areaChange: "Area Change",
  custom: "Custom",
};

const SEVERITY_META: Record<string, { cls: string; dot: string; label: string }> = {
  urgent_or_expired: {
    cls: "bg-red-50 border-red-200 text-red-800",
    dot: "bg-red-500",
    label: "Overdue / Expired",
  },
  attention: {
    cls: "bg-orange-50 border-orange-200 text-orange-800",
    dot: "bg-orange-500",
    label: "Renewal Soon",
  },
  upcoming_renewal: {
    cls: "bg-amber-50 border-amber-200 text-amber-800",
    dot: "bg-amber-500",
    label: "Upcoming Renewal",
  },
  scheduled: {
    cls: "bg-blue-50 border-blue-200 text-blue-800",
    dot: "bg-blue-500",
    label: "Scheduled",
  },
  completed: {
    cls: "bg-emerald-50 border-emerald-200 text-emerald-800",
    dot: "bg-emerald-500",
    label: "Completed",
  },
  info: {
    cls: "bg-muted border-border text-foreground",
    dot: "bg-muted-foreground",
    label: "Information",
  },
};

export default function Calendar() {
  const [, navigate] = useLocation();
  const [includeTypes, setIncludeTypes] = useState<EventType[]>(["license", "training", "areaChange", "custom"]);
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  const { data: events, isLoading } = trpc.calendar.listEvents.useQuery({
    from: new Date(Date.now() - 30 * 86400000),
    to: new Date(Date.now() + 365 * 86400000),
    includeTypes,
  });

  const toggleType = (t: EventType) => {
    setIncludeTypes((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t],
    );
  };

  const filtered = (events ?? []).filter((e) =>
    query ? e.title.toLowerCase().includes(query.toLowerCase()) : true,
  );

  // Group by month
  const groups: Record<string, (typeof filtered)[number][]> = {};
  for (const e of filtered) {
    const key = e.date.slice(0, 7);
    if (!groups[key]) groups[key] = [];
    groups[key].push(e);
  }
  const sortedKeys = Object.keys(groups).sort();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Calendar</h1>
          <p className="text-sm text-muted-foreground">
            License expiries, renewals, trainings, area changes, and custom events.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <CalendarPlus className="h-4 w-4 mr-1" />
          Add Custom Event
        </Button>
      </div>

      <Card>
        <CardContent className="pt-5 space-y-4">
          <div className="flex flex-wrap gap-4">
            {(Object.keys(TYPE_LABELS) as EventType[]).map((t) => (
              <label key={t} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={includeTypes.includes(t)}
                  onCheckedChange={() => toggleType(t)}
                />
                {TYPE_LABELS[t]}
              </label>
            ))}
          </div>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter events…"
            className="max-w-sm"
          />

          {isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">
              {events && events.length === 0
                ? "No upcoming events. Events are generated automatically from licenses, trainings, and area changes."
                : "No events match the current filters."}
            </p>
          ) : (
            <div className="space-y-6">
              {sortedKeys.map((key) => (
                <div key={key}>
                  <h3 className="text-sm font-semibold text-muted-foreground mb-2">
                    {new Date(`${key}-01T00:00:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" })}
                  </h3>
                  <div className="space-y-2">
                    {groups[key].map((e) => {
                      const meta = SEVERITY_META[e.severity] ?? SEVERITY_META.info;
                      return (
                        <div
                          key={e.id}
                          className={`border rounded-lg p-3 ${meta.cls}`}
                        >
                          <div className="flex items-start justify-between gap-2 flex-wrap">
                            <div className="min-w-0">
                              <p className="font-medium text-sm">{e.title}</p>
                              <p className="text-xs mt-0.5 opacity-80">
                                {new Date(`${e.date}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
                                {e.nurseName ? ` · ${e.nurseName}` : ""}
                                {e.areaName ? ` · ${e.areaName}` : ""}
                              </p>
                              {e.description ? <p className="text-xs mt-1 opacity-80">{e.description}</p> : null}
                              <div className="flex items-center gap-2 mt-1">
                                <span className={`inline-block h-2 w-2 rounded-full ${meta.dot}`} />
                                <span className="text-xs">{meta.label}</span>
                                <span className="text-xs border rounded px-1">{TYPE_LABELS[e.type]}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              {e.nurseId ? (
                                <Button variant="ghost" size="sm" onClick={() => navigate(`/nurses/${e.nurseId}`)}>
                                  View Nurse
                                </Button>
                              ) : null}
                              {e.type === "custom" && e.relatedEntityId ? (
                                <CustomEventActions id={e.relatedEntityId} />
                              ) : null}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5 flex items-center gap-2 text-sm text-muted-foreground">
          <MapPin className="h-4 w-4" />
          License and training events are generated automatically. Custom events are managed on this page.
        </CardContent>
      </Card>

      {createOpen && <CustomEventDialog open={createOpen} onOpenChange={setCreateOpen} />}
    </div>
  );
}

function CustomEventActions({ id }: { id: number }) {
  const utils = trpc.useUtils();
  const del = trpc.calendar.deleteCustomEvent.useMutation({
    onSuccess: () => {
      toast.success("Event deleted.");
      utils.calendar.listEvents.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-7 w-7"
      aria-label="Delete event"
      onClick={() => del.mutate({ id })}
    >
      <Trash2 className="h-3.5 w-3.5" />
    </Button>
  );
}

function CustomEventDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const utils = trpc.useUtils();
  const { data: nurses } = trpc.nurses.list.useQuery({ archived: false }, { enabled: open });
  const { data: areas } = trpc.areas.list.useQuery(undefined, { enabled: open });

  const [title, setTitle] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [description, setDescription] = useState("");
  const [nurseId, setNurseId] = useState<number | null>(null);
  const [areaId, setAreaId] = useState<number | null>(null);

  const create = trpc.calendar.createCustomEvent.useMutation({
    onSuccess: () => {
      toast.success("Event created.");
      utils.calendar.listEvents.invalidate();
      onOpenChange(false);
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Custom Event</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div>
            <Label className="mb-1 block">Title *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g., Hospital anniversary" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="mb-1 block">Date *</Label>
              <Input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
            </div>
            <div>
              <Label className="mb-1 block">Start Time (optional)</Label>
              <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="mb-1 block">Nurse (optional)</Label>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={nurseId ?? ""}
                onChange={(e) => setNurseId(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">None</option>
                {(nurses ?? []).map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.firstName} {n.lastName} ({n.employeeId})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label className="mb-1 block">Area (optional)</Label>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={areaId ?? ""}
                onChange={(e) => setAreaId(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">None</option>
                {(areas ?? []).map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <Label className="mb-1 block">Description (optional)</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button
              disabled={create.isPending || !title || !eventDate}
              onClick={() => {
                create.mutate({
                  title: title.trim(),
                  eventDate: new Date(eventDate),
                  startTime: startTime || undefined,
                  description: description.trim() || undefined,
                  nurseId: nurseId ?? undefined,
                  areaId: areaId ?? undefined,
                });
              }}
            >
              Create Event
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
