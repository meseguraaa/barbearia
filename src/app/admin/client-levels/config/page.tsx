// src/app/admin/client-levels/config/page.tsx
import { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { requireAdminPermission } from "@/lib/admin-permissions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { upsertCustomerLevelConfigsAction } from "@/app/admin/client-levels/actions";
import { CustomerLevel } from "@prisma/client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin | Nível de Cliente | Configurações",
};

const UNIT_COOKIE_NAME = "admin_unit_context";
const UNIT_ALL_VALUE = "all";

const LEVELS: CustomerLevel[] = ["BRONZE", "PRATA", "OURO", "DIAMANTE"];

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

function pickUnitIdFromCookieFallback(): string | null {
  // cookies() é server-only; essa função existe só pra clareza
  return null;
}

export default async function ClientLevelsConfigPage({
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

  // se unitId vier na URL, usa ele; senão tenta cookie; se cookie for "all", deixa null (mostra seletor)
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
        <h1 className="text-title text-content-primary">
          Configurações de Nível de Cliente
        </h1>
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

  const configs = await prisma.customerLevelConfig.findMany({
    where: { unitId: activeUnitId },
    orderBy: { level: "asc" },
  });

  const configMap = new Map<string, (typeof configs)[number]>();
  for (const c of configs) configMap.set(String(c.level), c);

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      <header className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-title text-content-primary">
              Configurações por nível
            </h1>
            <p className="text-paragraph-medium text-content-secondary">
              Defina os mínimos mensais para cada nível: atendimentos{" "}
              <span className="font-semibold">DONE</span> e pedidos{" "}
              <span className="font-semibold">COMPLETED</span>.
            </p>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="border-border-primary">
                Unidade: {unit?.name ?? activeUnitId}
              </Badge>
              <Badge variant="outline" className="border-border-primary">
                Salva com upsert
              </Badge>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button asChild variant="outline">
              <Link href="/admin/client-levels">Voltar</Link>
            </Button>
          </div>
        </div>

        {/* Seletor de unidade (server-rendered com GET) */}
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

      {/* FORM PRINCIPAL */}
      <section className="rounded-xl border border-border-primary bg-background-tertiary p-4 space-y-4">
        <form action={upsertCustomerLevelConfigsAction} className="space-y-4">
          {/* unitId obrigatório para action */}
          <input type="hidden" name="unitId" value={activeUnitId} />

          <div className="grid gap-3 md:grid-cols-2">
            {LEVELS.map((lvl) => {
              const c = configMap.get(String(lvl));
              const done = c?.minAppointmentsDone ?? 0;
              const completed = c?.minOrdersCompleted ?? 0;

              return (
                <div
                  key={lvl}
                  className="rounded-xl border border-border-primary bg-background-secondary p-4 space-y-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-paragraph-medium-size font-semibold text-content-primary">
                      {levelLabel(lvl)}
                    </p>
                    {c ? (
                      <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/40">
                        Configurado
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="border-border-primary text-content-secondary"
                      >
                        Novo
                      </Badge>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[11px] text-content-secondary">
                        Mínimo de agendamentos concluídos
                      </label>
                      <Input
                        name={`minAppointmentsDone_${lvl}`}
                        defaultValue={String(done)}
                        inputMode="numeric"
                        className="h-10 bg-background-tertiary border-border-primary"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] text-content-secondary">
                        Mínimo de pedidos entregues
                      </label>
                      <Input
                        name={`minOrdersCompleted_${lvl}`}
                        defaultValue={String(completed)}
                        inputMode="numeric"
                        className="h-10 bg-background-tertiary border-border-primary"
                      />
                    </div>
                  </div>

                  <p className="text-[11px] text-content-secondary">
                    Dica: coloque 0 para “sem exigência” naquele critério.
                  </p>
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <Button type="submit" size="sm" variant="edit2">
              Salvar configurações
            </Button>
            <Button asChild type="button" size="sm" variant="outline">
              <Link href="/admin/client-levels">Cancelar</Link>
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}
