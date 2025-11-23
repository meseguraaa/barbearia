import type { AppointmentStatus } from "@/types/appointment";

const STATUS_MAP: Record<
  AppointmentStatus,
  { label: string; className: string }
> = {
  PENDING: {
    label: "Pendente",
    className: "text-yellow-500 bg-yellow-100/10 border border-yellow-500",
  },
  DONE: {
    label: "Concluído",
    className: "text-green-500 bg-green-100/10 border border-green-500",
  },
  CANCELED: {
    label: "Cancelado",
    className: "text-red-500 bg-red-100/10 border border-red-500",
  },
};

type Props = {
  status?: AppointmentStatus | null;
};

export function AppointmentStatusBadge({ status }: Props) {
  const key = status ?? "PENDING";
  const item = STATUS_MAP[key];

  return (
    <span
      className={`
        px-3 py-1.5 text-xs font-medium rounded-full inline-block
        ${item.className}
      `}
    >
      {item.label}
    </span>
  );
}
