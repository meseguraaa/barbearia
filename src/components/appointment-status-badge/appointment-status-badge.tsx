import type { AppointmentStatus } from "@/types/appointment";

const STATUS_MAP: Record<
  AppointmentStatus,
  { label: string; className: string }
> = {
  PENDING: {
    label: "Pendente",
    className: "text-yellow-700 bg-yellow-100 border border-yellow-300",
  },
  DONE: {
    label: "Concluído",
    className: "text-green-700 bg-green-100 border border-green-300",
  },
  CANCELED: {
    label: "Cancelado",
    className: "text-red-700 bg-red-100 border border-red-300",
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
