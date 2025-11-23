import { Badge } from "@/components/ui/badge";

type ServiceStatus = "ACTIVE" | "INACTIVE";

const STATUS_MAP: Record<ServiceStatus, { label: string; className: string }> =
  {
    ACTIVE: {
      label: "Ativo",
      className: "text-green-500 bg-green-100/10 border border-green-500",
    },
    INACTIVE: {
      label: "Inativo",
      className: "text-red-500 bg-red-100/10 border border-red-500",
    },
  };

type ServiceStatusBadgeProps = {
  isActive: boolean;
};

export function ServiceStatusBadge({ isActive }: ServiceStatusBadgeProps) {
  const key: ServiceStatus = isActive ? "ACTIVE" : "INACTIVE";
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
