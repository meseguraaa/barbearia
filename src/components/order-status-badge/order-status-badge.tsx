// components/order-status-badge.tsx
import type { OrderStatus } from "@prisma/client";

const STATUS_MAP: Record<OrderStatus, { label: string; className: string }> = {
  PENDING: {
    label: "Pendente",
    className: "text-yellow-500 bg-yellow-100/10 border border-yellow-500",
  },

  // ⭐ Novo status: cliente fez pedido fora da barbearia
  PENDING_CHECKIN: {
    label: "Aguardando retirada",
    className: "text-blue-500 bg-blue-100/10 border border-blue-500",
  },

  // ⭐ Novo status: venda finalizada na barbearia
  COMPLETED: {
    label: "Concluído",
    className: "text-green-500 bg-green-100/10 border border-green-500",
  },

  CANCELED: {
    label: "Cancelado",
    className: "text-red-500 bg-red-100/10 border border-red-500",
  },
};

type Props = {
  status?: OrderStatus | null;
};

export function OrderStatusBadge({ status }: Props) {
  const key: OrderStatus = status ?? "PENDING";
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
