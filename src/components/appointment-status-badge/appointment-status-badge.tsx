import { Badge } from "@/components/ui/badge";
import type { AppointmentStatus } from "@/types/appointment";

const STATUS_MAP: Record<
  AppointmentStatus,
  { label: string; className: string }
> = {
  PENDING: {
    label: "Pendente",
    className: "bg-yellow-100 text-yellow-800",
  },
  DONE: {
    label: "Concluído",
    className: "bg-green-100 text-green-800",
  },
  CANCELED: {
    label: "Cancelado",
    className: "bg-red-100 text-red-800",
  },
};

type Props = {
  status?: AppointmentStatus | null;
};

export function AppointmentStatusBadge({ status }: Props) {
  const key = status ?? "PENDING";
  const item = STATUS_MAP[key];

  return <Badge className={item.className}>{item.label}</Badge>;
}
