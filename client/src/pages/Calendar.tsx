import { nurseIdLabel } from "@shared/nursetrack";
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
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { CalendarPlus, ChevronLeft, ChevronRight, MapPin, Pencil, Trash2 } from "lucide-react";
import { safeDateKey } from "@/lib/utils";
import { useMemo, useState } from "react";
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
    cls: "bg-[#FDE8EA] border-[#F6B5BD] text-[#C2364A]",
    dot: "bg-[#F95A6B]",
    label: "Overdue / Expired",
  },
  attention: {
    cls: "bg-[#FFF3E3] border-[#F4C58A] text-[#B4700A]",
    dot: "bg-[#E8A617]",
    label: "Renewal Soon",
  },
  upcoming_renewal: {
    cls: "bg-[#FBF6E6] border-[#EFD9A5] text-[#8A6508]",
    dot: "bg-[#D4A017]",
    label: "Upcoming Renewal",
  },
  scheduled: {
    cls: "bg-[#E4F4F8] border-[#A8DEEB] text-[#0E6E85]",
    dot: "bg-[#0FA4C7]",
    label: "Scheduled",
  },
  completed: {
    cls: "bg-emerald-50 border-emerald-200 text-emerald-800",
    dot: "bg-emerald-500",
    label: "Completed",
  },
  healthy: {
    cls: "bg-emerald-50 border-emerald-200 text-emerald-800",
    dot: "bg-emerald-500",
    label: "Completed",
  },
  informational: {
    cls: "bg-[#E4F4F8] border-[#A8DEEB] text-[#0E6E85]",
    dot: "bg-[#0FA4C7]",
    label: "Scheduled",
  },
  neutral: {
    cls: "bg-muted border-border text-foreground",
    dot: "bg-muted-foreground",
    label: "Information",
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
  const [view, setView] = useState<"month" | "agenda">("month");
  const [monthAnchor, setMonthAnchor] = useState(() => new Date());

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
    const key = safeDateKey(e.date).slice(0, 7) || "Other";
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

      <Card className="glass-card">
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
          <div className="ml-auto flex items-center gap-1" role="group" aria-label="Calendar view">
            <button
              className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${view === "month" ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-accent"}`}
              onClick={() => setView("month")}
            >
              Month
            </button>
            <button
              className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${view === "agenda" ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-accent"}`}
              onClick={() => setView("agenda")}
            >
              Agenda
            </button>
          </div>

          {isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : view === "month" ? (
            <MonthView events={filtered} month={monthAnchor} onMonthChange={setMonthAnchor} navigate={navigate} />
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

      <Card className="glass-card">
        <CardContent className="pt-5 flex items-center gap-2 text-sm text-muted-foreground">
          <MapPin className="h-4 w-4" />
          License and training events are generated automatically. Custom events are managed on this page.
        </CardContent>
      </Card>

      {createOpen && <CustomEventDialog open={createOpen} onOpenChange={setCreateOpen} />}
    </div>
  );
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function MonthView({
  events,
  month,
  onMonthChange,
  navigate,
}: {
  events: { id: string | number; title: string; date: string; severity: string; nurseName?: string | null; nurseId?: string | number | null; type: EventType }[];
  month: Date;
  onMonthChange: (d: Date) => void;
  navigate: (path: string) => void;
}) {
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | number | null>(null);
  const start = startOfWeek(startOfMonth(month), { weekStartsOn: 0 });
  const end = endOfWeek(endOfMonth(month), { weekStartsOn: 0 });
  const days = eachDayOfInterval({ start, end });
  const today = new Date();
  const dayEvents = useMemo(() => {
    const map = new Map<string, typeof events>();
    for (const e of events) {
      const key = safeDateKey(e.date);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return map;
  }, [events]);
  const selectedEvents = selectedDay ? dayEvents.get(format(selectedDay, "yyyy-MM-dd")) ?? [] : [];

  return (
    <div>
      {events.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-10 mb-3">
          No events match the current filters. Type-based and text filters are applied to the month grid as well.
        </p>
      ) : null}
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-medium">{format(month, "MMMM yyyy")}</h2>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => onMonthChange(subMonths(month, 1))} aria-label="Previous month">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className={isSameMonth(month, today) ? "pointer-events-none opacity-60" : undefined}
            onClick={() => onMonthChange(today)}
          >
            Today
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => onMonthChange(addMonths(month, 1))} aria-label="Next month">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-7 border rounded-lg overflow-hidden bg-background">
        {WEEKDAYS.map((w) => (
          <div key={w} className="bg-muted/60 px-2 py-1.5 text-xs font-medium text-muted-foreground text-center">{w}</div>
        ))}
        {days.map((d) => {
          const key = format(d, "yyyy-MM-dd");
          const evs = dayEvents.get(key) ?? [];
          const isCurrentMonth = isSameMonth(d, month);
          const isToday = isSameDay(d, today);
          const isSelected = selectedDay ? isSameDay(d, selectedDay) : false;
          return (
            <button
              key={key}
              type="button"
              className={`min-h-[72px] border-t border-r p-1 text-left transition-colors ${isCurrentMonth ? "bg-background" : "bg-muted/30 text-muted-foreground/60"} ${isSelected ? "ring-2 ring-inset ring-primary" : ""}`}
              onClick={() => setSelectedDay(d)}
              aria-label={`${format(d, "EEEE, MMMM d yyyy")}${evs.length ? `, ${evs.length} events` : ""}`}
            >
              <span
                className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${isToday ? "bg-primary text-primary-foreground font-semibold" : ""}`}
              >
                {format(d, "d")}
              </span>
              <div className="mt-0.5 space-y-0.5">
                {evs.slice(0, 3).map((e) => {
                  const meta = SEVERITY_META[e.severity] ?? SEVERITY_META.info;
                  const isSelectedEvent = selectedEventId === e.id;
                  return (
                    <button
                      key={e.id}
                      type="button"
                      className={`w-full text-left truncate rounded px-1 py-0.5 text-[10px] leading-tight ${meta.cls} ${isSelectedEvent ? "ring-2 ring-primary ring-offset-1" : "hover:opacity-80"}`}
                      title={e.title}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        setSelectedDay(d);
                        setSelectedEventId(isSelectedEvent ? null : e.id);
                      }}
                      aria-label={`${e.title}, ${format(d, "MMMM d yyyy")}`}
                    >
                      {e.title}
                    </button>
                  );
                })}
                {evs.length > 3 ? <p className="text-[10px] text-muted-foreground px-1">+{evs.length - 3} more</p> : null}
              </div>
            </button>
          );
        })}
      </div>
      {selectedDay ? (
        <div className="mt-3 space-y-2">
          <h3 className="text-sm font-semibold">{format(selectedDay, "EEEE, MMMM d, yyyy")}</h3>
          {selectedEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No events on this day.</p>
          ) : (
            <ul className="space-y-2">
              {selectedEvents.map((e) => {
                const meta = SEVERITY_META[e.severity] ?? SEVERITY_META.info;
                const isSelectedEvent = selectedEventId === e.id;
                return (
                  <li key={e.id}>
                    <button
                      type="button"
                      className={`w-full text-left border rounded-lg p-3 cursor-pointer hover:shadow-sm transition-shadow ${meta.cls} ${isSelectedEvent ? "ring-2 ring-primary ring-offset-1" : ""}`}
                      onClick={() => setSelectedEventId(isSelectedEvent ? null : e.id)}
                      aria-expanded={isSelectedEvent}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium text-sm">{e.title}</p>
                          <p className="text-xs mt-0.5 opacity-80">{e.nurseName ?? ""}</p>
                        </div>
                        <span className={`inline-block h-2 w-2 rounded-full self-center shrink-0 mt-1.5 ${meta.dot}`} />
                      </div>
                      {isSelectedEvent ? (
                        <div className="mt-3 pt-3 border-t border-black/10 space-y-2">
                          <p className="text-xs flex items-center gap-2">
                            <span className={`inline-block h-2 w-2 rounded-full ${meta.dot}`} />
                            <span className="font-medium">{meta.label}</span>
                            <span className="border rounded px-1">{TYPE_LABELS[e.type]}</span>
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {format(selectedDay, "EEEE, MMMM d, yyyy")}
                            {e.nurseName ? ` · ${e.nurseName}` : ""}
                          </p>
                          {e.nurseId ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={(ev) => {
                                ev.stopPropagation();
                                navigate(`/nurses/${e.nurseId}`);
                              }}
                            >
                              View Nurse
                            </Button>
                          ) : null}
                        </div>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
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
                    {n.firstName} {n.lastName} ({nurseIdLabel(n)})
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
