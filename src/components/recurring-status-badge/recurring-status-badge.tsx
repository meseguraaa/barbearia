import { Badge } from "@/components/ui/badge";

type RecurringStatus = "YES" | "NO";

const STATUS_MAP: Record<
  RecurringStatus,
  { label: string; className: string }
> = {
  YES: {
    label: "Sim",
    className: "text-green-500 bg-green-100/10 border border-green-500",
  },
  NO: {
    label: "Não",
    className: "text-slate-500 bg-slate-100/10 border border-slate-500",
  },
};

type RecurringStatusBadgeProps = {
  isRecurring: boolean;
};

export function RecurringStatusBadge({
  isRecurring,
}: RecurringStatusBadgeProps) {
  const key: RecurringStatus = isRecurring ? "YES" : "NO";
  const item = STATUS_MAP[key];

  return (
    <Badge
      variant="outline"
      className={`
        px-3 py-1.5 text-xs font-medium rounded-full
        ${item.className}
      `}
    >
      {item.label}
    </Badge>
  );
}
