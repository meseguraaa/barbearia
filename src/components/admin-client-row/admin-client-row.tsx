"use client";

import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";

export type AdminClientRowData = {
  id: string;
  name: string;
  email: string;
  phone: string;
  createdAt: Date;
  image: string | null;
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

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
});

export function AdminClientRow({ row }: AdminClientRowProps) {
  const createdAtLabel = format(row.createdAt, "dd/MM/yyyy", {
    locale: ptBR,
  });

  const lastDoneLabel = row.lastDoneDate
    ? format(row.lastDoneDate, "dd/MM/yyyy", { locale: ptBR })
    : "—";

  const totalSpentLabel = currencyFormatter.format(row.totalSpent);
  const totalCancelFeeLabel = currencyFormatter.format(row.totalCancelFee);

  return (
    <tr className="border-b border-border-primary last:border-b-0">
      {/* CLIENTE (foto + nome + email + telefone) */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          {/* Avatar */}
          <div className="h-10 w-10 overflow-hidden rounded-full bg-background-secondary border border-border-primary flex items-center justify-center text-xs font-medium text-content-secondary">
            {row.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={row.image}
                alt={row.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <span>{row.name.charAt(0).toUpperCase()}</span>
            )}
          </div>

          {/* Infos do cliente */}
          <div className="flex flex-col">
            <span className="text-paragraph-medium text-content-primary font-medium">
              {row.name}
            </span>
            <span className="text-paragraph-small text-content-secondary">
              {row.email || "Sem e-mail"}
            </span>
            <span className="text-paragraph-small text-content-secondary">
              {row.phone}
            </span>
          </div>
        </div>
      </td>

      {/* CRIADO EM */}
      <td className="px-4 py-3 text-paragraph-small text-content-primary">
        {createdAtLabel}
      </td>

      {/* AGEND. */}
      <td className="px-4 py-3 text-center text-paragraph-small text-content-primary">
        {row.totalAppointments}
      </td>

      {/* CONCLUÍDOS */}
      <td className="px-4 py-3 text-center text-paragraph-small text-content-primary">
        {row.doneCount}
      </td>

      {/* CANCELADOS */}
      <td className="px-4 py-3 text-center text-paragraph-small text-content-primary">
        {row.canceledCount}
      </td>

      {/* CANC. C/ TAXA */}
      <td className="px-4 py-3 text-center text-paragraph-small text-content-primary">
        {row.canceledWithFeeCount}
      </td>

      {/* TAXAS COBRADAS */}
      <td className="px-4 py-3 text-right text-paragraph-small text-content-primary">
        {totalCancelFeeLabel}
      </td>

      {/* PLANOS */}
      <td className="px-4 py-3 text-center text-paragraph-small text-content-primary">
        {row.totalPlans}
      </td>

      {/* PLANO ATIVO */}
      <td className="px-4 py-3 text-center">
        {row.hasActivePlan ? (
          <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
            Ativo
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-content-secondary">
            —
          </span>
        )}
      </td>

      {/* FREQUÊNCIA */}
      <td className="px-4 py-3 text-paragraph-small text-content-primary">
        {row.frequencyLabel}
      </td>

      {/* ÚLTIMO ATENDIMENTO */}
      <td className="px-4 py-3 text-paragraph-small text-content-primary">
        {lastDoneLabel}
      </td>

      {/* TOTAL GASTO */}
      <td className="px-4 py-3 text-right text-paragraph-small text-content-primary font-medium">
        {totalSpentLabel}
      </td>

      {/* AÇÕES (WhatsApp) */}
      <td className="px-4 py-3 text-right">
        {row.whatsappUrl ? (
          <a
            href={row.whatsappUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex"
          >
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="border-border-primary text-content-primary hover:bg-muted/40"
            >
              WhatsApp
              <ExternalLink className="ml-1 h-3 w-3" />
            </Button>
          </a>
        ) : (
          <span className="text-paragraph-small text-content-secondary">—</span>
        )}
      </td>
    </tr>
  );
}
