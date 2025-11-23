import { Badge } from "@/components/ui/badge";

type ServiceStatusBadgeProps = {
  isActive: boolean;
};

export function ServiceStatusBadge({ isActive }: ServiceStatusBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={`
        px-3 py-1.5 text-xs font-medium rounded-full
        ${
          isActive
            ? "text-green-700 bg-green-100 border border-green-300"
            : "text-red-700 bg-red-100 border border-red-300"
        }
      `}
    >
      {isActive ? "Ativo" : "Inativo"}
    </Badge>
  );
}
