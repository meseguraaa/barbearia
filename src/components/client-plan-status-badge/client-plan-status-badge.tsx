import type { ClientPlan } from "@prisma/client";

type ClientPlanStatus = ClientPlan["status"];

const CLIENT_PLAN_STATUS_MAP: Record<
  ClientPlanStatus,
  { label: string; className: string }
> = {
  ACTIVE: {
    label: "Ativo",
    className: "text-green-500 bg-green-100/10 border border-green-500",
  },
  EXPIRED: {
    label: "Expirado",
    className: "text-amber-500 bg-amber-100/10 border border-amber-500",
  },
  CANCELED: {
    label: "Cancelado",
    className: "text-red-500 bg-red-100/10 border border-red-500",
  },
};

type ClientPlanStatusBadgeProps = {
  status?: ClientPlanStatus | null;
};

export function ClientPlanStatusBadge({ status }: ClientPlanStatusBadgeProps) {
  const key: ClientPlanStatus = status ?? "ACTIVE";
  const item = CLIENT_PLAN_STATUS_MAP[key];

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
