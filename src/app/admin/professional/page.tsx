// app/admin/professional/page.tsx
import { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

import { ProfessionalNewDialog } from "@/components/professional-new-dialog";
import { ProfessionalEditDialog } from "@/components/professional-edit-dialog/professional-edit-dialog";
import { ServiceStatusBadge } from "@/components/service-status-badge";
import { toggleBarberStatus } from "@/app/admin/professional/actions";
import { Button } from "@/components/ui/button";

import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { requireAdminPermission } from "@/lib/admin-permissions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin | Profissionais",
};

const WEEKDAY_SHORT = [
  "Dom",
  "Seg",
  "Ter",
  "Qua",
  "Qui",
  "Sex",
  "Sáb",
] as const;

const WEEKDAY_FULL = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
] as const;

type WeeklyAvailabilityRow = {
  weekday: number;
  isActive: boolean;
  intervals: { startTime: string; endTime: string }[];
};

type DailyAvailabilityRow = {
  date: Date;
  type: "DAY_OFF" | "CUSTOM";
  intervals: { startTime: string; endTime: string }[];
};

type ProfessionalReviewStats = {
  avgRating: number;
  totalReviews: number;
  ratingsCount: { rating: number; count: number }[];
  topTags: { label: string; count: number }[];
};

type UnitOption = {
  id: string;
  name: string;
  isActive: boolean;
};

type ProfessionalUnitRow = {
  id: string;
  name: string;
  isActive: boolean;
  linkIsActive: boolean;
};

type ProfessionalRow = {
  id: string;
  name: string;
  email: string;
  phone: string;
  imageUrl: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  userId: string | null;
  weeklyAvailabilities: WeeklyAvailabilityRow[];
  dailyAvailabilities: DailyAvailabilityRow[];
  reviewStats: ProfessionalReviewStats | null;

  // ✅ unidades vinculadas
  units: ProfessionalUnitRow[];
};

function buildWeeklySummaryLabel(weekly: WeeklyAvailabilityRow[]): string {
  const active = weekly
    .filter((w) => w.isActive && w.intervals.length > 0)
    .sort((a, b) => a.weekday - b.weekday);

  if (active.length === 0) return "Sem escala semanal";

  if (active.length <= 3) {
    return active
      .map((w) => {
        const day = WEEKDAY_SHORT[w.weekday] ?? `Dia ${String(w.weekday)}`;
        const intervals = w.intervals
          .slice()
          .sort((a, b) => a.startTime.localeCompare(b.startTime))
          .map((it) => `${it.startTime}–${it.endTime}`)
          .join(", ");
        return `${day}: ${intervals}`;
      })
      .join(" • ");
  }

  return `${active.length} dias com escala`;
}

function buildExceptionsSummaryLabel(daily: DailyAvailabilityRow[]) {
  if (daily.length === 0) return "Sem exceções";

  const dayOff = daily.filter((d) => d.type === "DAY_OFF").length;
  const custom = daily.filter((d) => d.type === "CUSTOM").length;

  const parts: string[] = [];
  if (dayOff > 0) {
    parts.push(dayOff === 1 ? "1 dia de folga" : `${dayOff} dias de folga`);
  }
  if (custom > 0) {
    parts.push(
      custom === 1 ? "1 ajuste de horário" : `${custom} ajustes de horário`,
    );
  }

  return parts.join(" • ") || "Exceções cadastradas";
}

function buildUnitsSummaryLabel(units: ProfessionalUnitRow[]): string {
  const activeLinks = units.filter((u) => u.linkIsActive && u.isActive);
  if (activeLinks.length === 0) return "Sem unidade";

  if (activeLinks.length <= 2) {
    return activeLinks.map((u) => u.name).join(" • ");
  }

  return `${activeLinks.length} unidades`;
}

export default async function ProfessionalsPage() {
  // 🔐 Permissão: precisa ter acesso a Profissionais (ou ser Dono)
  await requireAdminPermission("canAccessProfessionals");

  // ✅ Units ativas para o onboarding (obrigatório ter pelo menos 1)
  const units: UnitOption[] = await prisma.unit.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, isActive: true },
  });

  const barbers = await prisma.barber.findMany({
    orderBy: { name: "asc" },
    include: {
      user: true,

      // ✅ vínculos N:N com unidade
      units: {
        include: {
          unit: true,
        },
      },

      weeklyAvailabilities: {
        include: { intervals: true },
      },
      dailyAvailabilities: {
        include: { intervals: true },
      },
      reviews: {
        include: {
          tags: {
            include: {
              tag: true,
            },
          },
        },
      },
    },
  });

  const rows: ProfessionalRow[] = barbers.map((barber) => {
    const reviews = barber.reviews ?? [];
    let reviewStats: ProfessionalReviewStats | null = null;

    if (reviews.length > 0) {
      const totalReviews = reviews.length;
      const sumRatings = reviews.reduce((acc, r) => acc + r.rating, 0);
      const avgRating = sumRatings / totalReviews;

      const ratingsCountMap = new Map<number, number>();
      for (let i = 1; i <= 5; i++) ratingsCountMap.set(i, 0);
      for (const r of reviews) {
        ratingsCountMap.set(r.rating, (ratingsCountMap.get(r.rating) ?? 0) + 1);
      }
      const ratingsCount = Array.from(ratingsCountMap.entries())
        .map(([rating, count]) => ({ rating, count }))
        .sort((a, b) => b.rating - a.rating);

      const tagMap = new Map<string, number>();
      for (const r of reviews) {
        for (const rt of r.tags ?? []) {
          const label = rt.tag.label;
          tagMap.set(label, (tagMap.get(label) ?? 0) + 1);
        }
      }
      const topTags = Array.from(tagMap.entries())
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => {
          if (b.count !== a.count) return b.count - a.count;
          return a.label.localeCompare(b.label);
        })
        .slice(0, 5);

      reviewStats = {
        avgRating,
        totalReviews,
        ratingsCount,
        topTags,
      };
    }

    const unitsRow: ProfessionalUnitRow[] = (barber.units ?? []).map((bu) => ({
      id: bu.unit.id,
      name: bu.unit.name,
      isActive: bu.unit.isActive,
      linkIsActive: bu.isActive,
    }));

    return {
      id: barber.id,
      name: barber.name,
      email: barber.email,
      phone: barber.phone ?? "—",
      imageUrl: barber.user?.image ?? null,
      isActive: barber.isActive,
      createdAt: barber.createdAt,
      updatedAt: barber.updatedAt,
      userId: barber.userId,

      units: unitsRow,

      weeklyAvailabilities: barber.weeklyAvailabilities.map((w) => ({
        weekday: w.weekday,
        isActive: w.isActive,
        intervals: w.intervals.map((i) => ({
          startTime: i.startTime,
          endTime: i.endTime,
        })),
      })),
      dailyAvailabilities: barber.dailyAvailabilities.map((d) => ({
        date: d.date,
        type: d.type,
        intervals: d.intervals.map((i) => ({
          startTime: i.startTime,
          endTime: i.endTime,
        })),
      })),
      reviewStats,
    };
  });

  const activeRows = rows.filter((r) => r.isActive);
  const inactiveRows = rows.filter((r) => !r.isActive);

  function renderRow(row: ProfessionalRow) {
    const weeklySummary = buildWeeklySummaryLabel(row.weeklyAvailabilities);
    const exceptionsSummary = buildExceptionsSummaryLabel(
      row.dailyAvailabilities,
    );
    const unitsSummary = buildUnitsSummaryLabel(row.units);

    const review = row.reviewStats;
    const avgRatingDisplay = review ? review.avgRating.toFixed(2) : "—";

    // ✅ ids das unidades vinculadas (somente vínculos ativos + unidade ativa)
    const selectedUnitIds = row.units
      .filter((u) => u.linkIsActive && u.isActive)
      .map((u) => u.id);

    return (
      <AccordionItem
        key={row.id}
        value={row.id}
        className="border border-border-primary rounded-xl bg-background-tertiary"
      >
        {/* LINHA SUPERIOR */}
        <div className="grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)_minmax(0,2fr)_auto] items-center gap-6 px-4 py-3">
          {/* COL 1: Trigger */}
          <AccordionTrigger className="flex items-center gap-3 min-w-0 hover:no-underline px-0 py-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-10 w-10 rounded-full bg-background-secondary border border-border-primary overflow-hidden flex items-center justify-center shrink-0">
                {row.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={row.imageUrl}
                    alt={row.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-xs font-medium text-content-secondary">
                    {row.name
                      .split(" ")
                      .map((n) => n[0])
                      .join("")
                      .slice(0, 2)
                      .toUpperCase()}
                  </span>
                )}
              </div>

              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <p className="text-paragraph-medium-size font-semibold text-content-primary truncate">
                    {row.name}
                  </p>
                  <ServiceStatusBadge isActive={row.isActive} />
                </div>

                <p className="text-xs text-content-secondary truncate">
                  {row.email || "Sem e-mail"}{" "}
                  <span className="mx-1 text-content-tertiary">•</span>{" "}
                  <span className="text-content-secondary">{unitsSummary}</span>
                </p>
              </div>
            </div>
          </AccordionTrigger>

          {/* COL 2 */}
          <div className="hidden md:block min-w-0 whitespace-nowrap text-xs text-content-primary truncate">
            <span className="text-content-secondary mr-1">Escala semanal:</span>
            {weeklySummary}
          </div>

          {/* COL 3 */}
          <div className="hidden md:block min-w-0 whitespace-nowrap text-xs text-content-primary truncate">
            <span className="text-content-secondary mr-1">Exceções:</span>
            {exceptionsSummary}
          </div>

          {/* COL 4 */}
          <div className="flex items-center justify-end gap-2 whitespace-nowrap">
            <ProfessionalEditDialog
              barber={{
                id: row.id,
                name: row.name,
                email: row.email,
                phone: row.phone === "—" ? null : row.phone,
                isActive: row.isActive,
                createdAt: row.createdAt,
                updatedAt: row.updatedAt,
                userId: row.userId,
                imageUrl: row.imageUrl,
              }}
              units={units}
              selectedUnitIds={selectedUnitIds}
            />

            <form action={toggleBarberStatus}>
              <input type="hidden" name="barberId" value={row.id} />
              <Button
                variant={row.isActive ? "destructive" : "active"}
                size="sm"
                type="submit"
                className="border-border-primary hover:bg-muted/40"
              >
                {row.isActive ? "Desativar" : "Ativar"}
              </Button>
            </form>
          </div>
        </div>

        {/* CONTEÚDO */}
        <AccordionContent className="border-t border-border-primary px-4 py-4">
          <div className="space-y-6">
            {/* BLOCO: Unidades */}
            <div className="rounded-2xl border border-border-primary bg-background-secondary p-4 space-y-3">
              <div>
                <h2 className="text-label-small text-content-primary">
                  Unidades vinculadas
                </h2>
                <p className="text-paragraph-small text-content-secondary">
                  Onde este profissional pode atuar (vínculos ativos).
                </p>
              </div>

              {row.units.filter((u) => u.linkIsActive && u.isActive).length ===
              0 ? (
                <div className="rounded-xl border border-dashed border-border-primary bg-background-tertiary px-4 py-6 text-center text-paragraph-small text-content-secondary">
                  Nenhuma unidade vinculada ainda.
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {row.units
                    .filter((u) => u.linkIsActive && u.isActive)
                    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
                    .map((u) => (
                      <span
                        key={u.id}
                        className="rounded-full border border-border-primary bg-background-tertiary px-3 py-1 text-[11px] text-content-secondary"
                      >
                        {u.name}
                      </span>
                    ))}
                </div>
              )}
            </div>

            {/* BLOCO: Reputação */}
            <div className="rounded-2xl border border-border-primary bg-background-secondary p-4 space-y-4">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                <div>
                  <h2 className="text-label-small text-content-primary">
                    Reputação do profissional
                  </h2>
                  <p className="text-paragraph-small text-content-secondary">
                    Visão geral das avaliações feitas pelos clientes nos
                    atendimentos deste profissional.
                  </p>
                </div>
                {review && (
                  <div className="text-right">
                    <p className="text-paragraph-small text-content-secondary">
                      Nota média
                    </p>
                    <p className="text-title font-semibold text-content-primary">
                      {avgRatingDisplay}
                      <span className="ml-2 text-yellow-500 align-middle">
                        {"★".repeat(Math.round(review.avgRating))}
                      </span>
                    </p>
                    <p className="text-paragraph-small text-content-secondary">
                      {review.totalReviews}{" "}
                      {review.totalReviews === 1 ? "avaliação" : "avaliações"}
                    </p>
                  </div>
                )}
              </div>

              {!review ? (
                <div className="mt-2 rounded-xl border border-dashed border-border-primary bg-background-tertiary px-4 py-6 text-center text-paragraph-small text-content-secondary">
                  Ainda não há avaliações registradas para este profissional.
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-[2fr,3fr]">
                  <div className="space-y-2">
                    <p className="text-label-small text-content-primary">
                      Distribuição de notas
                    </p>
                    <div className="space-y-1 text-[11px] text-content-secondary">
                      {review.ratingsCount.map((r) => (
                        <div
                          key={r.rating}
                          className="flex items-center justify-between gap-2"
                        >
                          <span className="flex items-center gap-1">
                            <span className="text-yellow-500">{r.rating}★</span>
                          </span>
                          <span className="text-content-primary font-medium">
                            {r.count}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-label-small text-content-primary">
                      Principais motivos citados
                    </p>
                    {review.topTags.length === 0 ? (
                      <p className="text-[11px] text-content-secondary">
                        Ainda não há tags suficientes para exibir aqui.
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {review.topTags.map((tag) => (
                          <span
                            key={tag.label}
                            className="rounded-full border border-border-primary bg-background-tertiary px-3 py-1 text-[11px] text-content-secondary"
                          >
                            {tag.label}{" "}
                            <span className="text-content-tertiary">
                              · {tag.count}
                            </span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* BLOCO: Disponibilidade semanal */}
            <div className="rounded-2xl border border-border-primary bg-background-secondary p-4 space-y-4">
              <div>
                <h2 className="text-label-small text-content-primary">
                  Disponibilidade
                </h2>
                <p className="text-paragraph-small text-content-secondary">
                  Visualização dos horários salvos pelo profissional. Alterações
                  devem ser feitas no painel dele.
                </p>
              </div>

              <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
                {WEEKDAY_SHORT.map((short, index) => {
                  const full = WEEKDAY_FULL[index];
                  const data = row.weeklyAvailabilities.find(
                    (w) => w.weekday === index,
                  ) ?? {
                    weekday: index,
                    isActive: false,
                    intervals: [],
                  };

                  const isActive = data.isActive && data.intervals.length > 0;

                  return (
                    <div
                      key={index}
                      className="rounded-xl border border-border-primary bg-background-tertiary p-3 space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs text-content-secondary">
                            {short}
                          </p>
                          <p className="text-paragraph-small text-content-primary font-medium">
                            {full}
                          </p>
                        </div>

                        <span
                          className={`text-[11px] px-2 py-0.5 rounded-full border ${
                            isActive
                              ? "border-brand-primary/60 text-brand-primary"
                              : "border-border-primary text-content-secondary"
                          }`}
                        >
                          {isActive ? "Sim" : "Não"}
                        </span>
                      </div>

                      <div className="space-y-1 text-[11px] text-content-primary">
                        {isActive ? (
                          data.intervals
                            .slice()
                            .sort((a, b) =>
                              a.startTime.localeCompare(b.startTime),
                            )
                            .map((it, idx) => (
                              <p key={idx}>
                                Das{" "}
                                <span className="font-medium">
                                  {it.startTime}
                                </span>{" "}
                                até{" "}
                                <span className="font-medium">
                                  {it.endTime}
                                </span>
                              </p>
                            ))
                        ) : (
                          <p className="text-content-secondary">
                            Sem horário definido.
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <p className="text-[11px] text-content-secondary">
                As exceções por dia (folgas, eventos, ajustes pontuais) estão
                listadas abaixo.
              </p>
            </div>

            {/* BLOCO: Exceções */}
            <div className="space-y-2">
              <h3 className="text-label-small text-content-primary">
                Exceções por dia
              </h3>
              <p className="text-paragraph-small text-content-secondary">
                Visualização de dias com horários diferentes do padrão semanal.
                O administrador não pode criar nem editar essas exceções por
                aqui.
              </p>

              {row.dailyAvailabilities.length === 0 ? (
                <div className="mt-2 rounded-xl border border-dashed border-border-primary bg-background-secondary px-4 py-6 text-center text-paragraph-small text-content-secondary">
                  Este profissional ainda não possui nenhuma exceção cadastrada.
                </div>
              ) : (
                <div className="mt-2 space-y-2">
                  {row.dailyAvailabilities
                    .slice()
                    .sort((a, b) => a.date.getTime() - b.date.getTime())
                    .map((ex, idx) => (
                      <div
                        key={idx}
                        className="rounded-xl border border-border-primary bg-background-secondary px-4 py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-2"
                      >
                        <div className="space-y-1">
                          <p className="text-paragraph-small text-content-primary font-medium">
                            {format(ex.date, "dd/MM/yyyy", { locale: ptBR })}
                          </p>
                          <p className="text-[11px] text-content-secondary">
                            {ex.type === "DAY_OFF"
                              ? "Dia de folga"
                              : "Horário personalizado"}
                          </p>
                        </div>

                        <div className="text-[11px] text-content-primary">
                          {ex.type === "DAY_OFF" ? (
                            <p>Sem atendimento neste dia.</p>
                          ) : ex.intervals.length === 0 ? (
                            <p className="text-content-secondary">
                              Sem intervalos definidos.
                            </p>
                          ) : (
                            ex.intervals.map((it, intervalIdx) => (
                              <p key={intervalIdx}>
                                Das{" "}
                                <span className="font-medium">
                                  {it.startTime}
                                </span>{" "}
                                até{" "}
                                <span className="font-medium">
                                  {it.endTime}
                                </span>
                              </p>
                            ))
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>
    );
  }

  return (
    <div className="space-y-8 max-w-7xl">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-title text-content-primary">Profissionais</h1>
          <p className="text-paragraph-medium text-content-secondary">
            Veja a disponibilidade, reputação e as unidades vinculadas de cada
            profissional.
          </p>
        </div>

        {/* ✅ Agora é obrigatório passar units */}
        <ProfessionalNewDialog units={units} />
      </header>

      <section className="space-y-4">
        <Accordion type="single" collapsible className="space-y-2">
          {activeRows.length === 0 ? (
            <p className="text-paragraph-small text-content-secondary px-2">
              Nenhum profissional ativo no momento.
            </p>
          ) : (
            activeRows.map(renderRow)
          )}
        </Accordion>
      </section>

      <section className="space-y-3">
        <h2 className="text-content-secondary text-paragraph-medium">
          Profissionais inativos
        </h2>

        <Accordion type="single" collapsible className="space-y-2">
          {inactiveRows.length === 0 ? (
            <div className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-6">
              <p className="text-paragraph-small text-content-secondary text-center">
                Nenhum profissional inativo no momento.
              </p>
            </div>
          ) : (
            inactiveRows.map(renderRow)
          )}
        </Accordion>
      </section>
    </div>
  );
}
