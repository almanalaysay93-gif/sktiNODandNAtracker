import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
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
import { AlertTriangle, Power, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

export default function Areas() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const { data: areas, isLoading } = trpc.areas.list.useQuery();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");

  const create = trpc.areas.create.useMutation({
    onSuccess: () => {
      toast.success("Area created.");
      utils.areas.list.invalidate();
      setOpen(false);
      setName("");
      setCode("");
      setDescription("");
    },
    onError: (e) => toast.error(e.message),
  });
  const update = trpc.areas.update.useMutation({
    onSuccess: () => utils.areas.list.invalidate(),
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-40" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Areas of Assignment</h1>
          <p className="text-sm text-muted-foreground">The fixed assignment areas in SKTI</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {areas?.map((a) => (
          <Card key={a.id} className={cn("glass-card", !a.active && "opacity-60")}>
            <CardContent className="pt-5">
              <div className="flex items-start justify-between gap-3">
                <button
                  onClick={() => navigate(`/areas/${a.id}`)}
                  className="flex-1 text-left"
                >
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-semibold">{a.name}</h2>
                    <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{a.code}</span>
                  </div>
                  {a.description && (
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{a.description}</p>
                  )}
                  <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <Users className="h-4 w-4" /> {a.nurseCount ?? 0} nurses
                    </span>
                    {a.licenseAttention ? (
                      <span className="inline-flex items-center gap-1 text-orange-600">
                        <AlertTriangle className="h-4 w-4" /> {a.licenseAttention} license attention
                      </span>
                    ) : null}
                  </div>
                </button>
                <div className="flex flex-col items-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => navigate(`/areas/${a.id}`)}>
                    Manage
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => update.mutate({ id: a.id, active: !a.active })}
                  >
                    <Power className="h-3.5 w-3.5 mr-1" />
                    {a.active ? "Deactivate" : "Activate"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Area</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="mb-1 block">Name *</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div>
                <Label className="mb-1 block">Code *</Label>
                <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g., ER" />
              </div>
            </div>
            <div>
              <Label className="mb-1 block">Description</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button
                onClick={() => create.mutate({ name: name.trim(), code: code.trim(), description: description.trim() || undefined })}
                disabled={create.isPending || !name.trim() || !code.trim()}
              >
                Create
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
