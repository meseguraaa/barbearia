// src/app/admin/client-levels/page.tsx
import { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { requireAdminPermission } from "@/lib/admin-permissions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin | Nível de Cliente",
};

const UNIT_COOKIE_NAME = "admin_unit_context";
const UNIT_ALL_VALUE = "all";

type LevelKey = "BRONZE" | "PRATA" | "OURO" | "DIAMANTE";

const LEVELS: LevelKey[] = ["BRONZE", "PRATA", "OURO", "DIAMANTE"];

function levelLabel(level: LevelKey) {
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

function ruleTypeLabel(type: string) {
  // hoje só existe HAS_ACTIVE_PLAN, mas já deixa bonitinho pra crescer
  if (type === "HAS_ACTIVE_PLAN") return "Tem plano ativo";
  return type;
}

export default async function ClientLevelsPage() {
  // 🔐 Permissão: por enquanto reaproveita a mesma de Clientes
  await requireAdminPermission("canAccessClients");

  const cookieStore = await cookies();
  const selectedUnit =
    cookieStore.get(UNIT_COOKIE_NAME)?.value ?? UNIT_ALL_VALUE;

  const showAllUnits = selectedUnit === UNIT_ALL_VALUE;

  // Unidades
  const units = await prisma.unit.findMany({
    where: showAllUnits ? {} : { id: selectedUnit },
    orderBy: { name: "asc" },
    select: { id: true, name: true, isActive: true },
  });

  // Configs
  const configs = await prisma.customerLevelConfig.findMany({
    where: showAllUnits ? {} : { unitId: selectedUnit },
    orderBy: [{ unitId: "asc" }, { level: "asc" }],
  });

  // Regras
  const rules = await prisma.customerLevelRule.findMany({
    where: showAllUnits ? {} : { unitId: selectedUnit },
    orderBy: [{ unitId: "asc" }, { priority: "desc" }, { createdAt: "asc" }],
  });

  // Mapa por unidade
  const configsByUnit = new Map<string, typeof configs>();
  for (const c of configs) {
    const arr = configsByUnit.get(c.unitId) ?? [];
    arr.push(c);
    configsByUnit.set(c.unitId, arr);
  }

  const rulesByUnit = new Map<string, typeof rules>();
  for (const r of rules) {
    const arr = rulesByUnit.get(r.unitId) ?? [];
    arr.push(r);
    rulesByUnit.set(r.unitId, arr);
  }

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      {/* HEADER */}
      <header className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-title text-content-primary">
              Nível de Cliente
            </h1>
            <p className="text-paragraph-medium text-content-secondary">
              Configure por unidade os requisitos de cada nível e regras
              especiais para clientes com planos.
            </p>
          </div>
        </div>
      </header>

      {/* CONTEÚDO */}
      {units.length === 0 ? (
        <section className="rounded-xl border border-border-primary bg-background-tertiary p-6">
          <p className="text-paragraph-medium text-content-secondary">
            Nenhuma unidade encontrada para o contexto atual.
          </p>
          <div className="mt-3">
            <Button asChild variant="outline">
              <Link href="/admin/settings">Ir para Configurações</Link>
            </Button>
          </div>
        </section>
      ) : (
        <section className="space-y-4">
          {units.map((u) => {
            const unitConfigs = configsByUnit.get(u.id) ?? [];
            const unitRules = rulesByUnit.get(u.id) ?? [];

            const configByLevel = new Map<
              string,
              (typeof unitConfigs)[number]
            >();
            for (const c of unitConfigs) configByLevel.set(String(c.level), c);

            const hasAnyConfig = unitConfigs.length > 0;
            const hasAnyRule = unitRules.length > 0;

            return (
              <div
                key={u.id}
                className="rounded-xl border border-border-primary bg-background-tertiary p-4 space-y-4"
              >
                {/* Unit header */}
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-paragraph-medium-size font-semibold text-content-primary">
                        {u.name}
                      </p>
                      {u.isActive ? (
                        <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/40">
                          Ativa
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="border-border-primary text-content-secondary"
                        >
                          Inativa
                        </Badge>
                      )}

                      {!hasAnyConfig && (
                        <Badge
                          variant="outline"
                          className="border-border-primary text-content-secondary"
                        >
                          Sem configurações
                        </Badge>
                      )}
                      {!hasAnyRule && (
                        <Badge
                          variant="outline"
                          className="border-border-primary text-content-secondary"
                        >
                          Sem regras
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Rotas futuras (Arquivo 4) */}
                    <Button asChild size="sm" variant="edit2">
                      <Link href={`/admin/client-levels/config?unitId=${u.id}`}>
                        Configuração por nível
                      </Link>
                    </Button>
                    <Button asChild size="sm" variant="edit2">
                      <Link href={`/admin/client-levels/rules?unitId=${u.id}`}>
                        Nível para planos
                      </Link>
                    </Button>
                  </div>
                </div>

                {/* Configs por nível */}
                <div className="rounded-xl border border-border-primary bg-background-secondary p-4 space-y-3">
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-label-small text-content-primary">
                      Configurações por nível
                    </p>
                    <p className="text-[11px] text-content-secondary">
                      Mínimos do mês: atendimentos concluídos e pedidos
                      entregues.
                    </p>
                  </div>

                  <div className="grid gap-2 md:grid-cols-2">
                    {LEVELS.map((lvl) => {
                      const c = configByLevel.get(lvl);

                      return (
                        <div
                          key={lvl}
                          className="rounded-xl border border-border-primary bg-background-tertiary p-3 flex items-center justify-between gap-3"
                        >
                          <div className="min-w-0">
                            <p className="text-paragraph-medium-size font-semibold text-content-primary">
                              {levelLabel(lvl)}
                            </p>
                            {c ? (
                              <p className="text-xs text-content-secondary">
                                Concluído:{" "}
                                <span className="text-content-primary font-semibold">
                                  {c.minAppointmentsDone}
                                </span>{" "}
                                • COMPLETED:{" "}
                                <span className="text-content-primary font-semibold">
                                  {c.minOrdersCompleted}
                                </span>
                              </p>
                            ) : (
                              <p className="text-xs text-content-secondary">
                                Ainda não configurado para este nível.
                              </p>
                            )}
                          </div>

                          <div className="shrink-0">
                            {c ? (
                              <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/40">
                                OK
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="border-border-primary text-content-secondary"
                              >
                                —
                              </Badge>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {!hasAnyConfig && (
                    <div className="pt-2">
                      <p className="text-paragraph-small text-content-secondary">
                        Ainda não há configurações cadastradas para essa
                        unidade. No próximo arquivo a gente cria a tela de
                        edição com upsert automático.
                      </p>
                    </div>
                  )}
                </div>

                {/* Regras */}
                <div className="rounded-xl border border-border-primary bg-background-secondary p-4 space-y-3">
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-label-small text-content-primary">
                      Nível para planos
                    </p>
                  </div>

                  {unitRules.length === 0 ? (
                    <p className="text-paragraph-small text-content-secondary">
                      Nenhuma regra especial cadastrada.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {unitRules.map((r) => (
                        <div
                          key={r.id}
                          className="rounded-xl border border-border-primary bg-background-tertiary p-3 flex items-start justify-between gap-3"
                        >
                          <div className="min-w-0 space-y-1">
                            <p className="text-paragraph-small text-content-primary font-medium">
                              {ruleTypeLabel(String(r.type))}
                              {" → "}
                              <span className="font-semibold">
                                {levelLabel(String(r.targetLevel) as LevelKey)}
                              </span>
                            </p>

                            <p className="text-[11px] text-content-secondary">
                              Prioridade:{" "}
                              <span className="text-content-primary font-semibold">
                                {r.priority}
                              </span>
                              {" • "}
                              Status:{" "}
                              <span className="text-content-primary font-semibold">
                                {r.isEnabled ? "Ativa" : "Desativada"}
                              </span>
                            </p>
                          </div>

                          <div className="shrink-0 flex items-center gap-2">
                            {/* rota futura */}
                            <Button asChild variant="outline">
                              <Link
                                href={`/admin/client-levels/rules?unitId=${u.id}`}
                              >
                                Editar
                              </Link>
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}
