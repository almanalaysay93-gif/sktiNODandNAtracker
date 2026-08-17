import { trpc } from "@/lib/trpc";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** Area selector populated from the seeded areas table. activeOnly excludes inactive areas. */
export function AreaSelect({
  value,
  onValueChange,
  activeOnly = false,
  placeholder = "Select area",
  className,
}: {
  value: string;
  onValueChange: (v: string) => void;
  activeOnly?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const { data: areas } = trpc.areas.list.useQuery();
  const options = (areas ?? []).filter((a) => !activeOnly || a.active);
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((a) => (
          <SelectItem key={a.id} value={String(a.id)}>
            {a.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
