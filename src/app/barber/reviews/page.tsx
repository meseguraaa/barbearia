// app/barber/reviews/page.tsx
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { jwtVerify } from "jose";
import type { Metadata } from "next";
import { startOfMonth, endOfMonth, parse, format } from "date-fns";
import { ptBR } from "date-fns/locale";

import { MonthPicker } from "@/components/month-picker";

const SESSION_COOKIE_NAME = "painel_session";

type PainelSessionPayload = {
  sub: string; // userId
  role: "CLIENT" | "BARBER" | "ADMIN";
  email: string;
  name?: string | null;
};

function getJwtSecretKey() {
  const secret = process.env.PAINEL_JWT_SECRET;
  if (!secret) {
    throw new Error("PAINEL_JWT_SECRET não definido no .env");
  }
  return new TextEncoder().encode(secret);
}

async function getCurrentBarber() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    redirect("/painel/login");
  }

  try {
    const { payload } = await jwtVerify<PainelSessionPayload>(
      token,
      getJwtSecretKey(),
    );

    if (payload.role !== "BARBER") {
      redirect("/painel/login");
    }

    // ✅ BarberWhereUniqueInput não aceita { email } no seu schema.
    // Uniques: id, userId, companyId_email. Então buscamos por userId (payload.sub).
    const barberByUserId = await prisma.barber.findUnique({
      where: { userId: payload.sub },
    });

    // fallback seguro (tokens antigos)
    const barber =
      barberByUserId ??
      (await prisma.barber.findFirst({
        where: { email: payload.email },
      }));

    if (!barber) {
      redirect("/painel/login");
    }

    const companyId = (barber as any)?.companyId as string | undefined;

    return { barber, companyId };
  } catch (error) {
    console.error("Erro ao validar sessão do barbeiro:", error);
    redirect("/painel/login");
  }
}

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Barbeiro | Avaliações",
};

type BarberReviewsPageProps = {
  searchParams: Promise<{
    month?: string; // yyyy-MM
  }>;
};

export default async function BarberReviewsPage({
  searchParams,
}: BarberReviewsPageProps) {
  const { barber, companyId } = await getCurrentBarber();

  // 🔒 Multi-tenant REAL: sem companyId, sem dados
  if (!companyId) {
    return (
      <div className="max-w-7xl space-y-6">
        <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-title text-content-primary">
              Minhas avaliações
            </h1>
            <p className="text-paragraph-medium-size text-content-secondary">
              Veja como os clientes avaliaram seus atendimentos.
            </p>
          </div>
        </header>

        <section className="rounded-xl border border-border-primary bg-background-tertiary p-4">
          <p className="text-paragraph-medium text-content-secondary">
            Seu usuário está sem vínculo de empresa (companyId). Peça para um
            administrador corrigir o cadastro do barbeiro.
          </p>
        </section>
      </div>
    );
  }

  const resolvedSearchParams = await searchParams;
  const monthParam = resolvedSearchParams.month;

  // Data de referência do filtro (mês)
  const referenceDate = monthParam
    ? parse(monthParam, "yyyy-MM", new Date())
    : new Date();

  const monthStart = startOfMonth(referenceDate);
  const monthEnd = endOfMonth(referenceDate);

  const rawMonthLabel = format(referenceDate, "MMMM 'de' yyyy", {
    locale: ptBR,
  });
  const monthLabel =
    rawMonthLabel.charAt(0).toUpperCase() + rawMonthLabel.slice(1);

  const [reviews, allReviewsForBarber] = await Promise.all([
    // ⭐ Avaliações do barbeiro no mês selecionado
    prisma.appointmentReview.findMany({
      where: {
        companyId, // ✅ scoping
        barberId: barber.id,
        createdAt: {
          gte: monthStart,
          lte: monthEnd,
        },
      },
      include: {
        client: true,
        appointment: {
          include: {
            service: true,
          },
        },
        tags: {
          include: {
            tag: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    }),

    // ⭐ Todas as avaliações históricas do barbeiro (sem filtro de data)
    prisma.appointmentReview.findMany({
      where: {
        companyId, // ✅ scoping
        barberId: barber.id,
      },
      select: {
        rating: true,
      },
    }),
  ]);

  // ================================
  // ESTATÍSTICAS GERAIS DO MÊS
  // ================================
  const totalReviewsMonth = reviews.length;
  const averageRatingMonth =
    totalReviewsMonth > 0
      ? reviews.reduce((acc, r) => acc + r.rating, 0) / totalReviewsMonth
      : 0;
  const averageRatingMonthDisplay =
    totalReviewsMonth > 0 ? averageRatingMonth.toFixed(2) : "—";

  // ================================
  // ESTATÍSTICAS HISTÓRICAS (GERAL)
  // ================================
  const totalReviewsOverall = allReviewsForBarber.length;
  const averageRatingOverall =
    totalReviewsOverall > 0
      ? allReviewsForBarber.reduce((acc, r) => acc + r.rating, 0) /
        totalReviewsOverall
      : 0;
  const averageRatingOverallDisplay =
    totalReviewsOverall > 0 ? averageRatingOverall.toFixed(2) : "—";

  // ================================
  // TAGS POSITIVAS / NEGATIVAS (MÊS)
  // ================================
  // Regras:
  // - positiva: nota 3, 4 ou 5
  // - negativa: nota 1 ou 2
  const positiveTagMap = new Map<string, number>();
  const negativeTagMap = new Map<string, number>();

  for (const review of reviews) {
    const isPositive = review.rating >= 3;
    const isNegative = review.rating <= 2;

    for (const rt of review.tags ?? []) {
      const label = rt.tag.label;

      if (isPositive) {
        positiveTagMap.set(label, (positiveTagMap.get(label) ?? 0) + 1);
      }

      if (isNegative) {
        negativeTagMap.set(label, (negativeTagMap.get(label) ?? 0) + 1);
      }
    }
  }

  const topPositiveTags = Array.from(positiveTagMap.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.label.localeCompare(b.label);
    })
    .slice(0, 8);

  const topNegativeTags = Array.from(negativeTagMap.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.label.localeCompare(b.label);
    })
    .slice(0, 8);

  // ================================
  // FEEDBACKS POSITIVOS / NEGATIVOS (MÊS)
  // ================================
  const positiveReviews = reviews.filter((r) => r.rating >= 3);
  const negativeReviews = reviews.filter((r) => r.rating <= 2);

  const recentPositiveReviews = [...positiveReviews]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 5);

  const recentNegativeReviews = [...negativeReviews]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 5);

  return (
    <div className="max-w-7xl space-y-6">
      {/* HEADER */}
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-title text-content-primary">Minhas avaliações</h1>
          <p className="text-paragraph-medium-size text-content-secondary">
            Veja como os clientes avaliaram seus atendimentos.
          </p>
          <p className="text-paragraph-small text-content-secondary">
            Mês selecionado:{" "}
            <span className="font-semibold text-content-primary">
              {monthLabel}
            </span>
          </p>
          <p className="mt-1 text-paragraph-small text-content-tertiary">
            Algumas avaliações podem ter o nome do cliente oculto, isso acontece
            quando ele opta por avaliação anônima.
          </p>
        </div>

        <div className="md:self-start">
          <MonthPicker />
        </div>
      </header>

      {/* BLOCO PRINCIPAL DE AVALIAÇÕES */}
      <section className="space-y-4 rounded-xl border border-border-primary bg-background-tertiary p-4">
        {/* RESUMO GERAL DO MÊS + HISTÓRICO */}
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-label-small text-content-secondary">
              Suas avaliações
            </p>

            {/* MÉDIA DO MÊS */}
            <p className="text-title text-content-primary">
              Nota média no mês:{" "}
              <span className="text-title font-semibold">
                {averageRatingMonthDisplay}
              </span>
              {totalReviewsMonth > 0 && (
                <span className="ml-2 align-middle text-xl text-yellow-500">
                  {"★".repeat(Math.round(averageRatingMonth))}
                </span>
              )}
            </p>

            {/* MÉDIA HISTÓRICA */}
            <p className="text-paragraph-small text-content-secondary">
              Nota média geral (histórico):{" "}
              <span className="font-semibold text-content-primary">
                {averageRatingOverallDisplay}
              </span>{" "}
              {totalReviewsOverall > 0 && (
                <span className="text-content-tertiary">
                  ({totalReviewsOverall} avaliações)
                </span>
              )}
            </p>

            {/* TOTAL NO MÊS */}
            <p className="text-paragraph-small text-content-secondary">
              Total de avaliações no mês:{" "}
              <span className="font-semibold text-content-primary">
                {totalReviewsMonth}
              </span>
            </p>
          </div>
        </div>

        {totalReviewsMonth === 0 ? (
          <p className="text-paragraph-small text-content-secondary">
            Você ainda não possui avaliações registradas neste mês.
          </p>
        ) : (
          <>
            {/* MOTIVOS POSITIVOS / NEGATIVOS MAIS CITADOS */}
            <div className="grid gap-4 border-t border-border-primary/60 pt-4 md:grid-cols-2">
              {/* POSITIVOS */}
              <div className="space-y-2">
                <p className="text-label-small text-content-primary">
                  Motivos positivos mais citados (no mês)
                </p>
                {topPositiveTags.length === 0 ? (
                  <p className="text-paragraph-small text-content-secondary">
                    Ainda não há motivos positivos suficientes neste mês.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {topPositiveTags.map((tag) => (
                      <span
                        key={tag.label}
                        className="flex items-center gap-1 rounded-full border border-emerald-500/60 bg-emerald-500/5 px-3 py-1 text-[11px] text-emerald-500"
                      >
                        <span>{tag.label}</span>
                        <span className="text-emerald-600">· {tag.count}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* NEGATIVOS */}
              <div className="space-y-2">
                <p className="text-label-small text-content-primary">
                  Motivos negativos mais citados (no mês)
                </p>
                {topNegativeTags.length === 0 ? (
                  <p className="text-paragraph-small text-content-secondary">
                    Nenhum motivo negativo se destacou neste mês. ✨
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {topNegativeTags.map((tag) => (
                      <span
                        key={tag.label}
                        className="flex items-center gap-1 rounded-full border border-destructive/40 bg-destructive/5 px-3 py-1 text-[11px] text-destructive"
                      >
                        <span>{tag.label}</span>
                        <span className="text-destructive">· {tag.count}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* FEEDBACKS POSITIVOS X NEGATIVOS (LADO A LADO) */}
            <div className="grid gap-4 border-t border-border-primary/60 pt-4 md:grid-cols-2">
              {/* FEEDBACKS POSITIVOS */}
              <div className="space-y-2">
                <p className="text-label-small text-content-primary">
                  Feedbacks positivos recentes (3–5 estrelas)
                </p>

                {recentPositiveReviews.length === 0 ? (
                  <p className="text-paragraph-small text-content-secondary">
                    Ainda não há feedbacks positivos registrados neste mês.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {recentPositiveReviews.map((rev) => {
                      const clientName = rev.isAnonymousForProfessional
                        ? "Cliente (anônimo)"
                        : (rev.client?.name ?? "Cliente");

                      const serviceName =
                        rev.appointment?.service?.name ?? "Atendimento";

                      return (
                        <div
                          key={rev.id}
                          className="space-y-1 rounded-xl border border-border-primary bg-background-secondary px-3 py-2 text-[11px]"
                        >
                          <p className="text-content-primary">
                            {clientName} ·{" "}
                            <span className="text-content-secondary">
                              {serviceName}
                            </span>{" "}
                            ·{" "}
                            <span className="text-yellow-500">
                              {rev.rating}★
                            </span>
                          </p>

                          {rev.tags.length > 0 && (
                            <p className="text-content-secondary">
                              Motivos:{" "}
                              {rev.tags.map((t) => t.tag.label).join(", ")}
                            </p>
                          )}

                          {rev.comment && (
                            <p className="text-content-secondary">
                              Comentário: {rev.comment}
                            </p>
                          )}

                          <p className="text-content-tertiary">
                            Registrado em:{" "}
                            {rev.createdAt.toLocaleString("pt-BR", {
                              day: "2-digit",
                              month: "2-digit",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* FEEDBACKS NEGATIVOS */}
              <div className="space-y-2">
                <p className="text-label-small text-content-primary">
                  Feedbacks negativos recentes (1–2 estrelas)
                </p>

                {recentNegativeReviews.length === 0 ? (
                  <p className="text-paragraph-small text-content-secondary">
                    Nenhum feedback negativo registrado neste mês. 🧡
                  </p>
                ) : (
                  <div className="space-y-2">
                    {recentNegativeReviews.map((rev) => {
                      const clientName = rev.isAnonymousForProfessional
                        ? "Cliente (anônimo)"
                        : (rev.client?.name ?? "Cliente");

                      const serviceName =
                        rev.appointment?.service?.name ?? "Atendimento";

                      return (
                        <div
                          key={rev.id}
                          className="space-y-1 rounded-xl border border-border-primary bg-background-secondary px-3 py-2 text-[11px]"
                        >
                          <p className="text-content-primary">
                            {clientName} ·{" "}
                            <span className="text-content-secondary">
                              {serviceName}
                            </span>{" "}
                            ·{" "}
                            <span className="text-yellow-500">
                              {rev.rating}★
                            </span>
                          </p>

                          {rev.tags.length > 0 && (
                            <p className="text-content-secondary">
                              Motivos:{" "}
                              {rev.tags.map((t) => t.tag.label).join(", ")}
                            </p>
                          )}

                          {rev.comment && (
                            <p className="text-content-secondary">
                              Comentário: {rev.comment}
                            </p>
                          )}

                          <p className="text-content-tertiary">
                            Registrado em:{" "}
                            {rev.createdAt.toLocaleString("pt-BR", {
                              day: "2-digit",
                              month: "2-digit",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
