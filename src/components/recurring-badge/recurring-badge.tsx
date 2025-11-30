// components/recurring-badge.tsx
import { Badge } from "@/components/ui/badge";

type RecurrenceStatus = "RECURRING" | "NON_RECURRING";

const RECURRENCE_MAP: Record<
  RecurrenceStatus,
  { label: string; className: string }
> = {
  RECURRING: {
    label: "Recorrente",
    className: "text-blue-500 bg-blue-100/10 border border-blue-500",
  },
  NON_RECURRING: {
    label: "Única",
    className: "text-slate-500 bg-slate-100/10 border border-slate-500",
  },
};

export function RecurringBadge({ isRecurring }: { isRecurring: boolean }) {
  const key: RecurrenceStatus = isRecurring ? "RECURRING" : "NON_RECURRING";

  const item = RECURRENCE_MAP[key];

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
