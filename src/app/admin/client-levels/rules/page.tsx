// src/app/admin/client-levels/rules/page.tsx
import { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { requireAdminPermission } from "@/lib/admin-permissions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  createCustomerLevelRuleAction,
  updateCustomerLevelRuleAction,
  toggleCustomerLevelRuleAction,
  deleteCustomerLevelRuleAction,
} from "@/app/admin/client-levels/actions";
import { CustomerLevel, CustomerLevelRuleType } from "@prisma/client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin | Nível de Cliente | Regras",
};

const UNIT_COOKIE_NAME = "admin_unit_context";
const UNIT_ALL_VALUE = "all";

const LEVELS: CustomerLevel[] = ["BRONZE", "PRATA", "OURO", "DIAMANTE"];
const RULE_TYPES: CustomerLevelRuleType[] = ["HAS_ACTIVE_PLAN"];

function levelLabel(level: CustomerLevel) {
  switch (level) {
    case "BRONZE":
      return "Bronze";
    case "PRATA":
      return "Prata";
    case "OURO":
      return "Ouro";
    case "DIAMANTE":
      return "Diamante";
  }
}

function ruleTypeLabel(type: CustomerLevelRuleType) {
  if (type === "HAS_ACTIVE_PLAN") return "Tem plano ativo";
  return type;
}

export default async function ClientLevelsRulesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminPermission("canAccessClients");

  const resolved = await searchParams;

  const unitIdParamRaw = resolved.unitId;
  const unitIdParam = Array.isArray(unitIdParamRaw)
    ? unitIdParamRaw[0]
    : unitIdParamRaw;

  const cookieStore = await cookies();
  const cookieUnit = cookieStore.get(UNIT_COOKIE_NAME)?.value;

  const preferredUnitId =
    unitIdParam && unitIdParam !== UNIT_ALL_VALUE
      ? unitIdParam
      : cookieUnit && cookieUnit !== UNIT_ALL_VALUE
        ? cookieUnit
        : null;

  const units = await prisma.unit.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, isActive: true },
  });

  const activeUnitId = preferredUnitId ?? units[0]?.id ?? null;

  if (!activeUnitId) {
    return (
      <div className="max-w-7xl mx-auto space-y-4">
        <h1 className="text-title text-content-primary">Regras especiais</h1>
        <p className="text-paragraph-medium text-content-secondary">
          Nenhuma unidade ativa encontrada.
        </p>
        <Button asChild variant="outline">
          <Link href="/admin/client-levels">Voltar</Link>
        </Button>
      </div>
    );
  }

  const unit = units.find((u) => u.id === activeUnitId) ?? null;

  const rules = await prisma.customerLevelRule.findMany({
    where: { unitId: activeUnitId },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
  });

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      <header className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-title text-content-primary">
              Regras especiais
            </h1>
            <p className="text-paragraph-medium text-content-secondary">
              Regras que podem “forçar” um nível, independentemente das
              contagens do mês.
            </p>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="border-border-primary">
                Unidade: {unit?.name ?? activeUnitId}
              </Badge>
              <Badge variant="outline" className="border-border-primary">
                Prioridade maior vence
              </Badge>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button asChild variant="outline">
              <Link href="/admin/client-levels">Voltar</Link>
            </Button>
          </div>
        </div>

        {/* Seletor de unidade */}
        <section className="rounded-xl border border-border-primary bg-background-tertiary p-4">
          <form
            method="GET"
            className="flex flex-col md:flex-row gap-3 md:items-end"
          >
            <div className="w-full md:w-[360px]">
              <label className="text-[11px] text-content-secondary">
                Unidade
              </label>
              <select
                name="unitId"
                defaultValue={activeUnitId}
                className="h-10 w-full rounded-md border border-border-primary bg-background-secondary px-3 text-sm text-content-primary"
              >
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>

            <Button type="submit" size="sm" variant="edit2">
              Carregar
            </Button>
          </form>
        </section>
      </header>

      {/* Criar nova regra */}
      <section className="rounded-xl border border-border-primary bg-background-tertiary p-4 space-y-3">
        <div>
          <p className="text-label-small text-content-primary">Nova regra</p>
          <p className="text-paragraph-small text-content-secondary">
            Exemplo: “Tem plano ativo → Diamante”.
          </p>
        </div>

        <form
          action={createCustomerLevelRuleAction}
          className="grid gap-3 md:grid-cols-4 items-end"
        >
          <input type="hidden" name="unitId" value={activeUnitId} />

          <div className="space-y-1">
            <label className="text-[11px] text-content-secondary">Tipo</label>
            <select
              name="type"
              defaultValue="HAS_ACTIVE_PLAN"
              className="h-10 w-full rounded-md border border-border-primary bg-background-secondary px-3 text-sm text-content-primary"
            >
              {RULE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {ruleTypeLabel(t)}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] text-content-secondary">
              Nível alvo
            </label>
            <select
              name="targetLevel"
              defaultValue="DIAMANTE"
              className="h-10 w-full rounded-md border border-border-primary bg-background-secondary px-3 text-sm text-content-primary"
            >
              {LEVELS.map((lvl) => (
                <option key={lvl} value={lvl}>
                  {levelLabel(lvl)}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] text-content-secondary">
              Prioridade
            </label>
            <Input
              name="priority"
              defaultValue="100"
              inputMode="numeric"
              className="h-10 bg-background-secondary border-border-primary"
            />
          </div>

          <div className="flex items-center gap-2">
            <Button type="submit" size="sm" variant="edit2" className="ml-auto">
              Criar
            </Button>
          </div>
        </form>
      </section>

      {/* Lista de regras */}
      <section className="space-y-2">
        {rules.length === 0 ? (
          <div className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-6">
            <p className="text-paragraph-small text-content-secondary text-center">
              Nenhuma regra cadastrada ainda.
            </p>
          </div>
        ) : (
          rules.map((r) => (
            <div
              key={r.id}
              className="rounded-xl border border-border-primary bg-background-tertiary p-4 space-y-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-paragraph-medium-size font-semibold text-content-primary">
                    {ruleTypeLabel(r.type)} → {levelLabel(r.targetLevel)}
                  </p>
                  <p className="text-[11px] text-content-secondary">
                    Prioridade:{" "}
                    <span className="text-content-primary font-semibold">
                      {r.priority}
                    </span>
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {/* Toggle: action tem assinatura (ruleId, formData), então usa bind */}
                  <form action={toggleCustomerLevelRuleAction.bind(null, r.id)}>
                    <Button
                      type="submit"
                      size="sm"
                      variant={r.isEnabled ? "destructive" : "active"}
                      className="border-border-primary hover:bg-muted/40"
                    >
                      {r.isEnabled ? "Desativar" : "Ativar"}
                    </Button>
                  </form>
                </div>
              </div>

              {/* Editar inline: action recebe só (formData), então NÃO usa bind */}
              <form
                action={updateCustomerLevelRuleAction}
                className="grid gap-3 md:grid-cols-4 items-end"
              >
                <input type="hidden" name="unitId" value={activeUnitId} />
                <input type="hidden" name="ruleId" value={r.id} />

                <div className="space-y-1">
                  <label className="text-[11px] text-content-secondary">
                    Tipo
                  </label>
                  <select
                    name="type"
                    defaultValue={r.type}
                    className="h-10 w-full rounded-md border border-border-primary bg-background-secondary px-3 text-sm text-content-primary"
                  >
                    {RULE_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {ruleTypeLabel(t)}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] text-content-secondary">
                    Nível alvo
                  </label>
                  <select
                    name="targetLevel"
                    defaultValue={r.targetLevel}
                    className="h-10 w-full rounded-md border border-border-primary bg-background-secondary px-3 text-sm text-content-primary"
                  >
                    {LEVELS.map((lvl) => (
                      <option key={lvl} value={lvl}>
                        {levelLabel(lvl)}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] text-content-secondary">
                    Prioridade
                  </label>
                  <Input
                    name="priority"
                    defaultValue={String(r.priority)}
                    inputMode="numeric"
                    className="h-10 bg-background-secondary border-border-primary"
                  />
                </div>

                {/* AÇÕES: Salvar + Excluir lado a lado */}
                <div className="flex items-center justify-end gap-2">
                  <Button type="submit" size="sm" variant="edit2">
                    Salvar
                  </Button>

                  <form action={deleteCustomerLevelRuleAction.bind(null, r.id)}>
                    <Button
                      type="submit"
                      variant="destructive"
                      size="sm"
                      className="border-border-primary hover:bg-muted/40"
                    >
                      Excluir
                    </Button>
                  </form>
                </div>
              </form>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
