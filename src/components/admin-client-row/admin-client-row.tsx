import Link from "next/link";
import { Button } from "@/components/ui/button";

export type AdminClientRowData = {
  id: string;
  name: string;
  email: string;
  phone: string;
  createdAt: Date;
  totalAppointments: number;
  doneCount: number;
  canceledCount: number;
  canceledWithFeeCount: number;
  totalCancelFee: number;
  totalPlans: number;
  hasActivePlan: boolean;
  frequencyLabel: string;
  lastDoneDate: Date | null;
  totalSpent: number;
  whatsappUrl: string | null;
};

type AdminClientRowProps = {
  row: AdminClientRowData;
};

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });
}

export function AdminClientRow({ row }: AdminClientRowProps) {
  return (
    <tr key={row.id} className="border-t border-border-primary">
      {/* Cliente */}
      <td className="px-4 py-3 align-middle">
        <div className="flex flex-col">
          <span className="font-medium text-content-primary">{row.name}</span>
          <span className="text-xs text-content-secondary">
            {row.email || "Sem e-mail"}
          </span>
          <span className="text-xs text-content-secondary">{row.phone}</span>
        </div>
      </td>

      {/* Criado em */}
      <td className="px-4 py-3 align-middle text-xs text-content-secondary">
        {row.createdAt.toLocaleDateString("pt-BR")}
      </td>

      {/* Agend. */}
      <td className="px-4 py-3 align-middle text-center text-xs">
        {row.totalAppointments}
      </td>

      {/* Concluídos */}
      <td className="px-4 py-3 align-middle text-center text-xs text-emerald-500">
        {row.doneCount}
      </td>

      {/* Cancelados */}
      <td className="px-4 py-3 align-middle text-center text-xs text-destructive">
        {row.canceledCount}
      </td>

      {/* Cancelamentos com taxa */}
      <td className="px-4 py-3 align-middle text-center text-xs text-amber-500">
        {row.canceledWithFeeCount}
      </td>

      {/* Total taxas cobradas */}
      <td className="px-4 py-3 align-middle text-right text-xs font-medium text-content-primary">
        {formatCurrency(row.totalCancelFee)}
      </td>

      {/* Planos */}
      <td className="px-4 py-3 align-middle text-center text-xs">
        {row.totalPlans}
      </td>

      {/* Plano ativo */}
      <td className="px-4 py-3 align-middle text-center">
        <span
          className={`inline-block rounded-full px-3 py-1 text-xs font-medium border ${
            row.hasActivePlan
              ? "border-emerald-500 text-emerald-500 bg-emerald-500/10"
              : "border-border-primary text-content-secondary bg-background-secondary/60"
          }`}
        >
          {row.hasActivePlan ? "Ativo" : "Sem plano"}
        </span>
      </td>

      {/* Frequência */}
      <td className="px-4 py-3 align-middle text-xs text-content-secondary">
        {row.frequencyLabel}
      </td>

      {/* Último atendimento */}
      <td className="px-4 py-3 align-middle text-xs text-content-secondary">
        {row.lastDoneDate ? row.lastDoneDate.toLocaleDateString("pt-BR") : "—"}
      </td>

      {/* Total gasto */}
      <td className="px-4 py-3 align-middle text-right text-xs font-medium text-content-primary">
        {formatCurrency(row.totalSpent)}
      </td>

      {/* Ações */}
      <td className="px-4 py-3 align-middle">
        <div className="flex items-center justify-end gap-2">
          {row.whatsappUrl && (
            <Link href={row.whatsappUrl} target="_blank">
              <Button
                variant="outline"
                size="sm"
                className="border-border-primary hover:bg-muted/40 text-xs"
              >
                WhatsApp
              </Button>
            </Link>
          )}
        </div>
      </td>
    </tr>
  );
}
