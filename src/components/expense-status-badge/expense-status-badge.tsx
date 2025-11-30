import { Badge } from "@/components/ui/badge";

export type ExpenseStatus = "PAID" | "PENDING" | "LATE";

const STATUS_MAP: Record<ExpenseStatus, { label: string; className: string }> =
  {
    PAID: {
      label: "Paga",
      className: "text-green-500 bg-green-100/10 border border-green-500",
    },
    PENDING: {
      label: "Pendente",
      className: "text-yellow-500 bg-yellow-100/10 border border-yellow-500",
    },
    LATE: {
      label: "Atrasada",
      className: "text-red-500 bg-red-100/10 border border-red-500",
    },
  };

type ExpenseStatusBadgeProps = {
  status: ExpenseStatus;
};

export function ExpenseStatusBadge({ status }: ExpenseStatusBadgeProps) {
  const item = STATUS_MAP[status];

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
