import { cn } from "@/lib/utils";
import { LICENSE_STATUS_META, type LicenseStatus } from "../../../../shared/nursetrack";
import { AlertCircle, AlertTriangle, BadgeCheck, Clock } from "lucide-react";

/** Color-coded status badge with icon + label — status is never conveyed by color alone. */
export function LicenseStatusBadge({ status, className }: { status: LicenseStatus; className?: string }) {
  const meta = LICENSE_STATUS_META[status];
  const icon =
    status === "Expired" ? (
      <AlertCircle className="h-3 w-3" />
    ) : status === "Within 6 Months" ? (
      <AlertTriangle className="h-3 w-3" />
    ) : status === "Within 1 Year" ? (
      <Clock className="h-3 w-3" />
    ) : (
      <BadgeCheck className="h-3 w-3" />
    );
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        meta.color === "red" && "bg-red-50 text-red-700 ring-1 ring-red-200",
        meta.color === "orange" && "bg-orange-50 text-orange-700 ring-1 ring-orange-200",
        meta.color === "yellow" && "bg-yellow-50 text-yellow-700 ring-1 ring-yellow-200",
        meta.color === "green" && "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
        className,
      )}
    >
      {icon}
      {meta.label}
    </span>
  );
}

export function EmploymentStatusBadge({ status, className }: { status: string; className?: string }) {
  const tone =
    status === "Active"
      ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
      : status === "On Leave" || status === "Temporary Assignment"
        ? "bg-yellow-50 text-yellow-700 ring-1 ring-yellow-200"
        : status === "Transferred"
          ? "bg-blue-50 text-blue-700 ring-1 ring-blue-200"
          : "bg-slate-100 text-slate-600 ring-1 ring-slate-200";
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap", tone, className)}>
      {status}
    </span>
  );
}

export function TrainingStatusBadge({ status, className }: { status: string; className?: string }) {
  const tone =
    status === "Completed"
      ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
      : status === "Scheduled"
        ? "bg-blue-50 text-blue-700 ring-1 ring-blue-200"
        : status === "Expired"
          ? "bg-red-50 text-red-700 ring-1 ring-red-200"
          : "bg-slate-100 text-slate-600 ring-1 ring-slate-200";
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap", tone, className)}>
      {status}
    </span>
  );
}
