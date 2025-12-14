// app/admin/settings/page.tsx
import { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";

import { AdminNewAdminDialog } from "@/components/admin-new-admin-dialog";
import { AdminPermissionsForm } from "@/components/admin-permissions-form";
import { AdminEditAdminDialog } from "@/components/admin-edit-admin-dialog";
import { AdminToggleAdminStatusButton } from "@/components/admin-toggle-admin-status-button";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

import { UnitNewDialog } from "@/components/unit-new-dialog";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin | Configurações",
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

function sortIntervals(intervals: { startTime: string; endTime: string }[]) {
  return intervals
    .slice()
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
}

/* ===========================
 * SERVER ACTIONS (UNITS)
 * =========================== */
async function saveUnitWeeklyHours(formData: FormData) {
  "use server";

  const unitId = String(formData.get("unitId") || "");
  if (!unitId) return;

  await prisma.$transaction(async (tx) => {
    for (let weekday = 0; weekday <= 6; weekday++) {
      const isActive = formData.get(`day-${weekday}-active`) === "on";

      const weekly = await tx.unitWeeklyAvailability.upsert({
        where: { unitId_weekday: { unitId, weekday } },
        update: { isActive },
        create: { unitId, weekday, isActive },
        select: { id: true },
      });

      await tx.unitWeeklyTimeInterval.deleteMany({
        where: { weeklyAvailabilityId: weekly.id },
      });

      if (!isActive) continue;

      const startTime = String(
        formData.get(`day-${weekday}-start`) || "",
      ).trim();
      const endTime = String(formData.get(`day-${weekday}-end`) || "").trim();

      if (!startTime || !endTime) continue;

      await tx.unitWeeklyTimeInterval.create({
        data: { weeklyAvailabilityId: weekly.id, startTime, endTime },
      });
    }
  });

  revalidatePath("/admin/settings");
  revalidatePath("/admin/settings/units");
  revalidatePath(`/admin/settings/units/${unitId}/hours`);
  redirect("/admin/settings");
}

async function applyDefaultUnitWeeklyHours(formData: FormData) {
  "use server";

  const unitId = String(formData.get("unitId") || "");
  if (!unitId) return;

  await prisma.$transaction(async (tx) => {
    const presets: Array<{
      weekday: number;
      isActive: boolean;
      intervals: { startTime: string; endTime: string }[];
    }> = [
      { weekday: 0, isActive: false, intervals: [] }, // Dom
      {
        weekday: 1,
        isActive: true,
        intervals: [{ startTime: "09:00", endTime: "18:00" }],
      },
      {
        weekday: 2,
        isActive: true,
        intervals: [{ startTime: "09:00", endTime: "18:00" }],
      },
      {
        weekday: 3,
        isActive: true,
        intervals: [{ startTime: "09:00", endTime: "18:00" }],
      },
      {
        weekday: 4,
        isActive: true,
        intervals: [{ startTime: "09:00", endTime: "18:00" }],
      },
      {
        weekday: 5,
        isActive: true,
        intervals: [{ startTime: "09:00", endTime: "18:00" }],
      },
      {
        weekday: 6,
        isActive: true,
        intervals: [{ startTime: "09:00", endTime: "13:00" }],
      },
    ];

    for (const p of presets) {
      const weekly = await tx.unitWeeklyAvailability.upsert({
        where: { unitId_weekday: { unitId, weekday: p.weekday } },
        update: { isActive: p.isActive },
        create: { unitId, weekday: p.weekday, isActive: p.isActive },
        select: { id: true },
      });

      await tx.unitWeeklyTimeInterval.deleteMany({
        where: { weeklyAvailabilityId: weekly.id },
      });

      if (p.intervals.length > 0) {
        await tx.unitWeeklyTimeInterval.createMany({
          data: p.intervals.map((it) => ({
            weeklyAvailabilityId: weekly.id,
            startTime: it.startTime,
            endTime: it.endTime,
          })),
        });
      }
    }
  });

  revalidatePath("/admin/settings");
  revalidatePath("/admin/settings/units");
  revalidatePath(`/admin/settings/units/${unitId}/hours`);
  redirect("/admin/settings");
}

async function clearUnitWeeklyHours(formData: FormData) {
  "use server";

  const unitId = String(formData.get("unitId") || "");
  if (!unitId) return;

  await prisma.$transaction(async (tx) => {
    for (let weekday = 0; weekday <= 6; weekday++) {
      const weekly = await tx.unitWeeklyAvailability.upsert({
        where: { unitId_weekday: { unitId, weekday } },
        update: { isActive: false },
        create: { unitId, weekday, isActive: false },
        select: { id: true },
      });

      await tx.unitWeeklyTimeInterval.deleteMany({
        where: { weeklyAvailabilityId: weekly.id },
      });
    }
  });

  revalidatePath("/admin/settings");
  revalidatePath("/admin/settings/units");
  revalidatePath(`/admin/settings/units/${unitId}/hours`);
  redirect("/admin/settings");
}

/* ===========================
 * TYPES
 * =========================== */
type AdminRow = {
  id: string;
  name: string;
  email: string;
  phone: string;
  birthday: Date | null;
  createdAt: Date;
  isOwner: boolean;
  isActive: boolean;
  permissions: {
    canAccessDashboard: boolean;
    canAccessCheckout: boolean;
    canAccessAppointments: boolean;
    canAccessProfessionals: boolean;
    canAccessServices: boolean;
    canAccessReviews: boolean;
    canAccessProducts: boolean;
    canAccessClients: boolean;
    canAccessFinance: boolean;
  };
};

export default async function SettingsPage() {
  const [units, admins] = await Promise.all([
    prisma.unit.findMany({
      orderBy: { createdAt: "asc" },
      include: {
        weeklyAvailabilities: {
          include: { intervals: true },
        },
      },
    }),
    prisma.user.findMany({
      where: { role: "ADMIN" },
      include: { adminAccess: true },
      orderBy: { name: "asc" },
    }),
  ]);

  // ✅ formato que o AdminNewAdminDialog espera
  const unitOptions = units.map((u) => ({
    id: u.id,
    name: u.name,
    isActive: u.isActive,
  }));

  const adminRows: AdminRow[] = admins.map((admin) => {
    const phone = (admin as any).phone as string | null | undefined;

    return {
      id: admin.id,
      name: admin.name ?? "Admin sem nome",
      email: admin.email ?? "",
      phone: phone || "—",
      birthday: (admin as any).birthday ?? null,
      createdAt: admin.createdAt,
      isOwner: (admin as any).isOwner ?? false,
      isActive: (admin as any).isActive ?? true,
      permissions: {
        canAccessDashboard: admin.adminAccess?.canAccessDashboard ?? false,
        canAccessCheckout: admin.adminAccess?.canAccessCheckout ?? false,
        canAccessAppointments:
          admin.adminAccess?.canAccessAppointments ?? false,
        canAccessProfessionals:
          admin.adminAccess?.canAccessProfessionals ?? false,
        canAccessServices: admin.adminAccess?.canAccessServices ?? false,
        canAccessReviews: admin.adminAccess?.canAccessReviews ?? false,
        canAccessProducts: admin.adminAccess?.canAccessProducts ?? false,
        canAccessClients: admin.adminAccess?.canAccessClients ?? false,
        canAccessFinance: admin.adminAccess?.canAccessFinance ?? false,
      },
    };
  });

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* HEADER GERAL */}
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-title text-content-primary">Configurações</h1>
          <p className="text-paragraph-medium text-content-secondary">
            Gerencie unidades e controle quais administradores têm acesso a cada
            módulo do painel.
          </p>
        </div>
      </header>

      {/* =========================
       * UNIDADES (ACCORDION + HORÁRIO DENTRO)
       * ========================= */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-paragraph-medium font-semibold text-content-primary">
              Unidades
            </h2>
            <p className="text-paragraph-small text-content-secondary">
              Cada unidade tem seu próprio horário. Abra uma unidade para
              editar.
            </p>
          </div>

          <UnitNewDialog />
        </div>

        {units.length === 0 ? (
          <div className="rounded-xl border border-border-primary bg-background-tertiary p-5">
            <p className="text-paragraph-medium text-content-primary font-semibold">
              Você ainda não tem nenhuma unidade cadastrada.
            </p>
            <p className="text-paragraph-small text-content-secondary mt-1">
              Clique em <strong>Adicionar unidade</strong> para criar a
              primeira.
            </p>
          </div>
        ) : (
          <Accordion type="single" collapsible className="space-y-2">
            {units.map((unit) => {
              const weeklyByDay = new Map<
                number,
                {
                  isActive: boolean;
                  intervals: { startTime: string; endTime: string }[];
                }
              >();

              for (const w of unit.weeklyAvailabilities ?? []) {
                weeklyByDay.set(w.weekday, {
                  isActive: w.isActive,
                  intervals: w.intervals.map((i) => ({
                    startTime: i.startTime,
                    endTime: i.endTime,
                  })),
                });
              }

              const days = Array.from({ length: 7 }).map((_, weekday) => {
                const stored =
                  weeklyByDay.get(weekday) ??
                  ({ isActive: false, intervals: [] } as const);

                const intervals = sortIntervals(stored.intervals);
                const first = intervals[0] ?? { startTime: "", endTime: "" };

                const isOpen = stored.isActive && intervals.length > 0;

                return {
                  weekday,
                  short: WEEKDAY_SHORT[weekday] ?? `Dia ${weekday}`,
                  full: WEEKDAY_FULL[weekday] ?? `Dia ${weekday}`,
                  isActive: stored.isActive,
                  isOpen,
                  startTime: first.startTime,
                  endTime: first.endTime,
                };
              });

              const openDaysCount = days.filter((d) => d.isOpen).length;

              return (
                <AccordionItem
                  key={unit.id}
                  value={unit.id}
                  className="border border-border-primary rounded-xl bg-background-tertiary"
                >
                  {/* Cabeçalho: resumo da unidade */}
                  <div className="flex items-center justify-between gap-4 px-4 py-3">
                    <AccordionTrigger className="flex flex-1 items-center gap-6 hover:no-underline px-0 py-0">
                      <div className="flex flex-col text-left min-w-60 flex-1">
                        <p className="text-paragraph-medium font-semibold text-content-primary">
                          {unit.name}
                        </p>

                        <p className="text-xs text-content-secondary truncate max-w-[620px]">
                          Telefone:{" "}
                          <span className="text-content-primary">
                            {unit.phone || "—"}
                          </span>{" "}
                          • Endereço:{" "}
                          <span className="text-content-primary">
                            {unit.address || "—"}
                          </span>{" "}
                          • Status:{" "}
                          <span className="text-content-primary">
                            {unit.isActive ? "Ativa" : "Inativa"}
                          </span>
                        </p>

                        <p className="mt-1 text-[11px] text-content-secondary">
                          Criada em{" "}
                          {format(unit.createdAt, "dd/MM/yyyy HH:mm", {
                            locale: ptBR,
                          })}
                        </p>
                      </div>

                      <div className="hidden md:flex items-center gap-2">
                        <Badge variant="outline">
                          {openDaysCount === 0
                            ? "Sem horário"
                            : openDaysCount === 1
                              ? "1 dia com horário"
                              : `${openDaysCount} dias com horário`}
                        </Badge>

                        <Badge variant="outline">
                          {unit.isActive ? "Unidade ativa" : "Unidade inativa"}
                        </Badge>
                      </div>
                    </AccordionTrigger>

                    {/* Ações rápidas */}
                    <div className="flex items-center gap-2">
                      <form action={applyDefaultUnitWeeklyHours}>
                        <input type="hidden" name="unitId" value={unit.id} />
                        <Button type="submit" variant="outline" size="sm">
                          Aplicar padrão
                        </Button>
                      </form>

                      <form action={clearUnitWeeklyHours}>
                        <input type="hidden" name="unitId" value={unit.id} />
                        <Button type="submit" variant="destructive" size="sm">
                          Fechar semana
                        </Button>
                      </form>
                    </div>
                  </div>

                  {/* Conteúdo: editor de horário (layout da disponibilidade) */}
                  <AccordionContent className="border-t border-border-primary px-4 py-4">
                    <div className="rounded-2xl border border-border-primary bg-background-secondary p-4 space-y-4">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div>
                          <h3 className="text-label-small text-content-primary">
                            Disponibilidade da unidade
                          </h3>
                          <p className="text-paragraph-small text-content-secondary">
                            Ajuste o padrão semanal de atendimento desta
                            unidade.
                          </p>
                        </div>

                        <form action={saveUnitWeeklyHours}>
                          <input type="hidden" name="unitId" value={unit.id} />
                          <Button type="submit" variant="brand">
                            Salvar padrão semanal
                          </Button>
                        </form>
                      </div>

                      <form action={saveUnitWeeklyHours} className="space-y-4">
                        <input type="hidden" name="unitId" value={unit.id} />

                        <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
                          {days.map((d) => (
                            <div
                              key={d.weekday}
                              className="rounded-xl border border-border-primary bg-background-tertiary p-4 space-y-4"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="text-xs text-content-secondary">
                                    {d.short}
                                  </p>
                                  <p className="text-paragraph-small text-content-primary font-medium">
                                    {d.full}
                                  </p>
                                </div>

                                <span
                                  className={`shrink-0 rounded-full border px-3 py-1 text-[11px] ${
                                    d.isActive
                                      ? "border-brand-primary/60 text-brand-primary"
                                      : "border-border-primary text-content-secondary"
                                  }`}
                                >
                                  {d.isActive ? "Sim" : "Não"}
                                </span>
                              </div>

                              <label className="flex items-center justify-between gap-2 text-[11px] text-content-secondary">
                                <span>Atende</span>
                                <input
                                  type="checkbox"
                                  name={`day-${d.weekday}-active`}
                                  defaultChecked={d.isActive}
                                  className="accent-brand-primary"
                                />
                              </label>

                              <div className="space-y-2">
                                <div className="space-y-1">
                                  <p className="text-[11px] text-content-secondary">
                                    Das
                                  </p>
                                  <Input
                                    type="time"
                                    name={`day-${d.weekday}-start`}
                                    defaultValue={d.startTime}
                                    className="bg-background-secondary border-border-primary text-content-primary"
                                  />
                                </div>

                                <div className="space-y-1">
                                  <p className="text-[11px] text-content-secondary">
                                    Até
                                  </p>
                                  <Input
                                    type="time"
                                    name={`day-${d.weekday}-end`}
                                    defaultValue={d.endTime}
                                    className="bg-background-secondary border-border-primary text-content-primary"
                                  />
                                </div>
                              </div>

                              <p className="text-[11px] text-content-secondary/80">
                                Campos em branco não são salvos.
                              </p>
                            </div>
                          ))}
                        </div>
                      </form>

                      <div className="pt-2">
                        <p className="text-[11px] text-content-secondary">
                          Exceções por dia (folgas/eventos) entram no próximo
                          passo, quando criarmos a tabela de exceções da
                          unidade.
                        </p>
                      </div>

                      <div className="pt-2">
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/admin/settings/units/${unit.id}`}>
                            Ajustar dados da unidade
                          </Link>
                        </Button>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        )}
      </section>

      {/* =========================
       * ADMINISTRADORES
       * ========================= */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-paragraph-medium font-semibold text-content-primary">
              Administradores
            </h2>
            <p className="text-paragraph-small text-content-secondary">
              Controle quais administradores têm acesso a cada módulo do painel.
            </p>
          </div>

          <AdminNewAdminDialog units={unitOptions} />
        </div>

        {adminRows.length === 0 ? (
          <div className="rounded-xl border border-border-primary bg-background-tertiary p-5">
            <p className="text-paragraph-medium text-content-primary font-semibold">
              Nenhum administrador cadastrado ainda.
            </p>
            <p className="text-paragraph-small text-content-secondary mt-1">
              Crie um admin para delegar acessos do painel.
            </p>
            <div className="mt-4">
              <AdminNewAdminDialog units={unitOptions} />
            </div>
          </div>
        ) : (
          <Accordion type="single" collapsible className="space-y-2">
            {adminRows.map((row) => (
              <AccordionItem
                key={row.id}
                value={row.id}
                className="border border-border-primary rounded-xl bg-background-tertiary"
              >
                <div className="flex items-center justify-between gap-4 px-4 py-3">
                  <AccordionTrigger className="flex flex-1 items-center gap-6 hover:no-underline px-0 py-0">
                    <div className="flex flex-col text-left min-w-60 flex-1">
                      <p className="text-paragraph-medium font-semibold text-content-primary">
                        {row.name}
                      </p>

                      <p className="text-xs text-content-secondary truncate max-w-[260px]">
                        {row.email || "Sem e-mail"}
                      </p>
                    </div>

                    <div className="hidden md:flex flex-col text-left w-[140px]">
                      <span className="text-[11px] text-content-secondary">
                        Telefone
                      </span>
                      <span className="text-xs text-content-primary">
                        {row.phone}
                      </span>
                    </div>

                    <div className="hidden sm:flex flex-col text-left w-[180px]">
                      <span className="text-[11px] text-content-secondary">
                        Tipo
                      </span>
                      <span className="text-xs text-content-primary">
                        {row.isOwner
                          ? "Dono (acesso total)"
                          : "Admin configurável"}
                      </span>
                    </div>
                  </AccordionTrigger>

                  {!row.isOwner && (
                    <div className="flex items-center gap-2">
                      <AdminEditAdminDialog
                        admin={{
                          id: row.id,
                          name: row.name,
                          email: row.email,
                          phone: row.phone,
                          birthday: row.birthday,
                        }}
                      />
                      <AdminToggleAdminStatusButton
                        userId={row.id}
                        isActive={row.isActive}
                      />
                    </div>
                  )}
                </div>

                <AccordionContent className="border-t border-border-primary px-4 py-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-xl border border-border-primary bg-background-secondary p-4 space-y-2">
                      <p className="text-label-small text-content-primary">
                        Dados do admin
                      </p>
                      <div className="space-y-1 text-paragraph-small">
                        <p>
                          <span className="text-content-secondary">Nome: </span>
                          <span className="text-content-primary font-medium">
                            {row.name}
                          </span>
                        </p>
                        <p>
                          <span className="text-content-secondary">
                            E-mail:{" "}
                          </span>
                          <span className="text-content-primary">
                            {row.email || "—"}
                          </span>
                        </p>
                        <p>
                          <span className="text-content-secondary">
                            Telefone:{" "}
                          </span>
                          <span className="text-content-primary">
                            {row.phone}
                          </span>
                        </p>
                        <p>
                          <span className="text-content-secondary">
                            Nascimento:{" "}
                          </span>
                          <span className="text-content-primary">
                            {row.birthday
                              ? format(row.birthday, "dd/MM/yyyy", {
                                  locale: ptBR,
                                })
                              : "Não informado"}
                          </span>
                        </p>
                        <p>
                          <span className="text-content-secondary">
                            Cadastrado em:{" "}
                          </span>
                          <span className="text-content-primary">
                            {format(row.createdAt, "dd/MM/yyyy HH:mm", {
                              locale: ptBR,
                            })}
                          </span>
                        </p>
                        <p>
                          <span className="text-content-secondary">
                            Status:{" "}
                          </span>
                          <span className="text-content-primary font-medium">
                            {row.isActive ? "Ativo" : "Inativo"}
                          </span>
                        </p>
                      </div>
                    </div>

                    <div className="rounded-xl border border-border-primary bg-background-secondary p-4 space-y-3">
                      <p className="text-label-small text-content-primary">
                        Permissões de acesso
                      </p>

                      {row.isOwner ? (
                        <p className="text-paragraph-small text-content-secondary">
                          Este usuário é o <strong>dono</strong> do
                          estabelecimento e possui acesso total a todos os
                          módulos.
                        </p>
                      ) : (
                        <AdminPermissionsForm
                          userId={row.id}
                          initialPermissions={row.permissions}
                        />
                      )}
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </section>
    </div>
  );
}
