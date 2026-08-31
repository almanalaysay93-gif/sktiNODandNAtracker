import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { NurseFormDialog } from "./NurseFormDialog";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { useLocation, useRoute } from "wouter";

export function NurseEditPage() {
  const [, params] = useRoute("/nurses/:id/edit");
  const id = Number(params?.id);
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const { data: nurse, isLoading } = trpc.nurses.get.useQuery({ id }, { enabled: !Number.isNaN(id) });

  const [open, setOpen] = useState(true);

  if (Number.isNaN(id)) {
    return <p className="text-sm text-muted-foreground">Invalid nurse.</p>;
  }
  if (isLoading) {
    return <Skeleton className="h-64 w-full" />;
  }
  const editData = nurse ? { ...nurse, dateHired: nurse.dateHired ?? new Date() } : undefined;
  if (!nurse) {
    return (
      <div className="space-y-4">
        <Button
          variant="ghost"
          onClick={() => {
            if (window.history.length > 1) {
              window.history.back();
            } else {
              navigate("/nurses");
            }
          }}
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <p className="text-sm text-muted-foreground">Nurse not found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Button
        variant="ghost"
        onClick={() => {
          if (window.history.length > 1) {
            window.history.back();
          } else {
            navigate(`/nurses/${id}`);
          }
        }}
      >
        <ArrowLeft className="h-4 w-4 mr-1" /> Back
      </Button>
      <NurseFormDialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) {
            utils.nurses.get.invalidate({ id });
            navigate(`/nurses/${id}`);
          }
        }}
        nurse={editData as never}
      />
    </div>
  );
}
