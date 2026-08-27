import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

/** Nurse avatar: shows profile photo (signed URL) or initials fallback. */
export function NurseAvatar({
  nurse,
  size = "md",
  className,
}: {
  nurse: {
    firstName: string;
    middleName?: string | null;
    lastName: string;
    suffix?: string | null;
    profilePhotoKey?: string | null;
  };
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const initials = `${(nurse.firstName ?? "?").charAt(0)}${(nurse.lastName ?? "").charAt(0)}`;
  const sizeClasses = {
    xs: "h-7 w-7 text-[10px]",
    sm: "h-9 w-9 text-xs",
    md: "h-12 w-12 text-sm",
    lg: "h-16 w-16 text-base",
    xl: "h-24 w-24 text-xl",
  };
  return (
    <Avatar className={cn(sizeClasses[size], "border bg-muted", className)}>
      {nurse.profilePhotoKey ? (
        <AvatarImage src={`/storage/${nurse.profilePhotoKey}`} alt={`${nurse.firstName} ${nurse.lastName}`} />
      ) : null}
      <AvatarFallback className="font-medium">{initials.toUpperCase()}</AvatarFallback>
    </Avatar>
  );
}
