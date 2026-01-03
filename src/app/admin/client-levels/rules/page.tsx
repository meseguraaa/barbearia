// src/app/admin/client-levels/rules/page.tsx
import { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { requireAdminPermission } from "@/lib/admin-permissions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  createCustomerLevelRuleAction,
  updateCustomerLevelRuleAction,
  deleteCustomerLevelRuleAction,
} from "@/app/admin/client-levels/actions";
import { CustomerLevel, CustomerLevelRuleType } from "@prisma/client";
import { jwtVerify } from "jose";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin | Nível de Cliente",
};

const UNIT_COOKIE_NAME = "admin_unit_context";
const UNIT_ALL_VALUE = "all";

// ✅ Multi-tenant cookie
const COMPANY_COOKIE_NAME = "admin_company_context";
const COMPANY_COOKIE_FALLBACK = "companyId";

// ✅ sessão do painel
const SESSION_COOKIE_NAME = "painel_session";

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

type PainelSessionPayload = {
  sub: string;
  role: "CLIENT" | "BARBER" | "ADMIN";
  email: string;
  name?: string | null;
  companyId?: string;
};

function getJwtSecretKey() {
  const secret = process.env.PAINEL_JWT_SECRET;
  if (!secret) {
    throw new Error("PAINEL_JWT_SECRET não definido no .env");
  }
  return new TextEncoder().encode(secret);
}

async function readSessionPayloadOrNull(): Promise<PainelSessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getJwtSecretKey());
    return payload as unknown as PainelSessionPayload;
  } catch {
    return null;
  }
}

async function requireCompanyId(): Promise<string> {
  const cookieStore = await cookies();

  // 1) ✅ cookie de contexto
  const fromCookie =
    cookieStore.get(COMPANY_COOKIE_NAME)?.value ??
    cookieStore.get(COMPANY_COOKIE_FALLBACK)?.value ??
    "";

  const normalizedCookie = String(fromCookie).trim();
  if (normalizedCookie) return normalizedCookie;

  // 2) ✅ token do painel (se tiver companyId)
  const session = await readSessionPayloadOrNull();
  const fromToken = String(session?.companyId ?? "").trim();
  if (fromToken) return fromToken;

  // 3) ✅ membership fallback
  if (!session?.sub) {
    throw new Error(
      "Contexto de empresa ausente (companyId). Faça login novamente e selecione uma empresa.",
    );
  }

  const memberships = await prisma.companyMember.findMany({
    where: {
      userId: session.sub,
      isActive: true,
      company: { isActive: true },
    },
    select: { companyId: true },
    orderBy: { createdAt: "asc" },
    take: 20,
  });

  const uniqueCompanyIds = Array.from(
    new Set(memberships.map((m) => m.companyId).filter(Boolean)),
  );

  if (uniqueCompanyIds.length === 1) {
    return uniqueCompanyIds[0]!;
  }

  throw new Error(
    "Contexto de empresa ausente (companyId). Selecione uma empresa antes de acessar esta tela.",
  );
}

export default async function ClientLevelsRulesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // ✅ permissão correta pra esta tela
  await requireAdminPermission("canAccessClientLevels");

  const companyId = await requireCompanyId();

  const resolved = await searchParams;

  const unitIdParamRaw = resolved.unitId;
  const unitIdParam = Array.isArray(unitIdParamRaw)
    ? unitIdParamRaw[0]
    : unitIdParamRaw;

  const createParamRaw = resolved.create;
  const createParam = Array.isArray(createParamRaw)
    ? createParamRaw[0]
    : createParamRaw;

  const cookieStore = await cookies();
  const cookieUnit = cookieStore.get(UNIT_COOKIE_NAME)?.value;

  const preferredUnitId =
    unitIdParam && unitIdParam !== UNIT_ALL_VALUE
      ? unitIdParam
      : cookieUnit && cookieUnit !== UNIT_ALL_VALUE
        ? cookieUnit
        : null;

  // ✅ units sempre por companyId
  const units = await prisma.unit.findMany({
    where: { companyId, isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, isActive: true },
  });

  const activeUnitId = preferredUnitId ?? units[0]?.id ?? null;

  if (!activeUnitId) {
    return (
      <div className="max-w-7xl mx-auto space-y-4">
        <h1 className="text-title text-content-primary">Nível para planos</h1>
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
  if (!unit) {
    throw new Error("Unidade inválida para a empresa atual (companyId).");
  }

  // ✅ rules sempre por companyId
  const rules = await prisma.customerLevelRule.findMany({
    where: { companyId, unitId: activeUnitId },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
  });

  const hasRule = rules.length > 0;
  const isCreateMode = createParam === "1" && !hasRule;
  const hasOnlyOneUnit = units.length === 1;

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      <header className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-title text-content-primary">
              Nível para planos
            </h1>
            <p className="text-paragraph-medium text-content-secondary">
              Regras que podem “forçar” um nível, independentemente das
              contagens do mês.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button asChild variant="outline">
              <Link href="/admin/client-levels">Voltar</Link>
            </Button>
          </div>
        </div>

        <section className="rounded-xl border border-border-primary bg-background-tertiary p-4">
          {hasOnlyOneUnit ? (
            <div className="flex flex-col md:flex-row md:items-end gap-3">
              <div className="w-full md:w-90">
                <label className="text-[11px] text-content-secondary">
                  Unidade
                </label>
                <div className="h-10 w-full rounded-md border border-border-primary bg-background-secondary px-3 text-sm text-content-primary flex items-center">
                  {unit?.name ?? activeUnitId}
                </div>
              </div>

              <div className="flex items-center gap-2 md:ml-auto">
                {!hasRule && (
                  <Button asChild size="sm" variant="edit2">
                    <Link
                      href={`/admin/client-levels/rules?unitId=${activeUnitId}&create=1`}
                    >
                      Criar
                    </Link>
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <form
              method="GET"
              className="flex flex-col md:flex-row gap-3 md:items-end"
            >
              <div className="w-full md:w-90">
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

              <div className="flex items-center gap-2">
                <Button type="submit" size="sm" variant="edit2">
                  Carregar
                </Button>

                {!hasRule && (
                  <Button asChild size="sm" variant="edit2">
                    <Link
                      href={`/admin/client-levels/rules?unitId=${activeUnitId}&create=1`}
                    >
                      Criar
                    </Link>
                  </Button>
                )}
              </div>
            </form>
          )}

          {hasRule ? (
            <p className="mt-2 text-[11px] text-content-secondary">
              Esta unidade já possui 1 regra. Para remover, basta excluir.
            </p>
          ) : (
            <p className="mt-2 text-[11px] text-content-secondary">
              Esta tela permite apenas 1 regra por unidade.
            </p>
          )}
        </section>
      </header>

      {isCreateMode && (
        <section className="rounded-xl border border-border-primary bg-background-tertiary p-4 space-y-3">
          <div>
            <p className="text-label-small text-content-primary">Nova regra</p>
            <p className="text-paragraph-small text-content-secondary">
              Exemplo: “Tem plano ativo → Diamante”.
            </p>
          </div>

          <form
            action={createCustomerLevelRuleAction}
            className="grid gap-3 md:grid-cols-3 items-end"
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

            <div className="flex items-center justify-end gap-2">
              <Button type="submit" size="sm" variant="edit2">
                Salvar
              </Button>

              <Button asChild type="button" size="sm" variant="destructive">
                <Link
                  href={`/admin/client-levels/rules?unitId=${activeUnitId}`}
                >
                  Cancelar
                </Link>
              </Button>
            </div>
          </form>
        </section>
      )}

      <section className="space-y-2">
        {!hasRule && !isCreateMode ? (
          <div className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-6">
            <p className="text-paragraph-small text-content-secondary text-center">
              Nenhuma regra cadastrada.
            </p>
          </div>
        ) : (
          rules.map((r) => {
            const updateFormId = `update-rule-${r.id}`;
            const deleteFormId = `delete-rule-${r.id}`;

            return (
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
                      Para desativar, exclua a regra.
                    </p>
                  </div>
                </div>

                <form
                  id={updateFormId}
                  action={updateCustomerLevelRuleAction}
                  className="grid gap-3 md:grid-cols-[1fr_1fr_auto] items-end"
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

                  <div className="flex items-center justify-end gap-2">
                    <Button type="submit" size="sm" variant="edit2">
                      Salvar
                    </Button>

                    <Button
                      type="submit"
                      form={deleteFormId}
                      variant="destructive"
                      size="sm"
                      className="border-border-primary hover:bg-muted/40"
                    >
                      Excluir
                    </Button>
                  </div>
                </form>

                <form
                  id={deleteFormId}
                  action={deleteCustomerLevelRuleAction.bind(null, r.id)}
                >
                  <input type="hidden" name="unitId" value={activeUnitId} />
                </form>
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}
