// app/admin/settings/page.tsx
import { Metadata } from "next";
import { prisma } from "@/lib/prisma";
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

import { UnitNewDialog } from "@/components/unit-new-dialog";

import type { UnitWeeklyAvailabilityState } from "@/components/unit-weekly-availability-form/unit-weekly-availability-form";
import { UnitWeeklyAvailabilityConnected } from "@/components/unit-weekly-availability-connected/unit-weekly-availability-connected";

// ✅ modal/botão de exceção da unidade (CLIENT)
import { UnitDailyExceptionModal } from "@/components/unit-daily-exception-modal/unit-daily-exception-modal";

// ✅ lista das exceções (SERVER)
import { UnitDailyExceptionsList } from "@/components/unit-daily-exceptions-list/unit-daily-exceptions-list";

import { UnitEditDialog } from "@/components/unit-edit-dialog/unit-edit-dialog";

// ✅ botão de ativar/desativar unidade (igual profissionais)
import { UnitToggleUnitStatusButton } from "@/components/unit-toggle-unit-status-button/unit-toggle-unit-status-button";

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

function sortIntervals(intervals: { startTime: string; endTime: string }[]) {
  return intervals
    .slice()
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
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

  const activeUnits = units.filter((u) => u.isActive);
  const inactiveUnits = units.filter((u) => !u.isActive);

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
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-title text-content-primary">Configurações</h1>
          <p className="text-paragraph-medium text-content-secondary">
            Gerencie unidades e controle quais administradores têm acesso a cada
            módulo do painel.
          </p>
        </div>
      </header>

      {/* UNIDADES */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-paragraph-medium font-semibold text-content-primary">
              Unidades
            </h2>
            <p className="text-paragraph-small text-content-secondary">
              Abra uma unidade para ajustar o horário (padrão semanal) sem sair
              desta tela.
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
          <>
            {/* ATIVAS */}
            {activeUnits.length === 0 ? (
              <div className="rounded-xl border border-border-primary bg-background-tertiary p-5">
                <p className="text-paragraph-medium text-content-primary font-semibold">
                  Nenhuma unidade ativa no momento.
                </p>
                <p className="text-paragraph-small text-content-secondary mt-1">
                  Ative uma unidade na seção <strong>Unidades inativas</strong>{" "}
                  ou crie uma nova.
                </p>
              </div>
            ) : (
              <Accordion type="single" collapsible className="space-y-2">
                {activeUnits.map((unit) => {
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
                    const first = intervals[0] ?? {
                      startTime: "",
                      endTime: "",
                    };

                    return {
                      weekday,
                      short: WEEKDAY_SHORT[weekday] ?? `Dia ${weekday}`,
                      isActive: stored.isActive,
                      startTime: first.startTime,
                      endTime: first.endTime,
                    };
                  });

                  const openDaysCount = days.filter(
                    (d) => d.isActive && d.startTime && d.endTime,
                  ).length;

                  const initialValue: UnitWeeklyAvailabilityState = {
                    0: {
                      active: days[0]?.isActive ?? false,
                      startTime: days[0]?.startTime ?? "",
                      endTime: days[0]?.endTime ?? "",
                    },
                    1: {
                      active: days[1]?.isActive ?? true,
                      startTime: days[1]?.startTime ?? "",
                      endTime: days[1]?.endTime ?? "",
                    },
                    2: {
                      active: days[2]?.isActive ?? true,
                      startTime: days[2]?.startTime ?? "",
                      endTime: days[2]?.endTime ?? "",
                    },
                    3: {
                      active: days[3]?.isActive ?? true,
                      startTime: days[3]?.startTime ?? "",
                      endTime: days[3]?.endTime ?? "",
                    },
                    4: {
                      active: days[4]?.isActive ?? true,
                      startTime: days[4]?.startTime ?? "",
                      endTime: days[4]?.endTime ?? "",
                    },
                    5: {
                      active: days[5]?.isActive ?? true,
                      startTime: days[5]?.startTime ?? "",
                      endTime: days[5]?.endTime ?? "",
                    },
                    6: {
                      active: days[6]?.isActive ?? true,
                      startTime: days[6]?.startTime ?? "",
                      endTime: days[6]?.endTime ?? "",
                    },
                  };

                  return (
                    <AccordionItem
                      key={unit.id}
                      value={unit.id}
                      className="border border-border-primary rounded-xl bg-background-tertiary"
                    >
                      <div className="flex items-center justify-between gap-4 px-4 py-3">
                        <AccordionTrigger className="flex flex-1 items-center gap-6 hover:no-underline px-0 py-0">
                          <div className="flex flex-col text-left min-w-60 flex-1">
                            <p className="text-paragraph-medium font-semibold text-content-primary">
                              {unit.name}
                            </p>

                            <p className="text-xs text-content-secondary truncate max-w-[720px]">
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
                            <Badge
                              variant="outline"
                              className={
                                openDaysCount > 0
                                  ? "border border-green-500 bg-green-100/10 text-green-500"
                                  : ""
                              }
                            >
                              {openDaysCount === 0
                                ? "Sem horário"
                                : openDaysCount === 1
                                  ? "1 dia com horário"
                                  : `${openDaysCount} dias com horário`}
                            </Badge>
                          </div>
                        </AccordionTrigger>

                        <div className="flex items-center gap-2">
                          <UnitEditDialog
                            unit={{
                              id: unit.id,
                              name: unit.name,
                              phone: unit.phone,
                              address: unit.address,
                              isActive: unit.isActive,
                            }}
                          />

                          <UnitToggleUnitStatusButton
                            unitId={unit.id}
                            isActive={unit.isActive}
                          />
                        </div>
                      </div>

                      <AccordionContent className="border-t border-border-primary px-4 py-4">
                        <div className="space-y-6">
                          <header className="flex items-center justify-between">
                            <div className="space-y-1">
                              <h3 className="text-title text-content-primary">
                                Disponibilidade
                              </h3>
                              <p className="text-paragraph-medium-size text-content-secondary">
                                Defina o horário padrão da unidade para receber
                                agendamentos. Exceções por dia sobrescrevem o
                                padrão semanal.
                              </p>
                            </div>
                          </header>

                          <section className="space-y-6">
                            {/* WEEKLY */}
                            <div className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-4 space-y-3">
                              <UnitWeeklyAvailabilityConnected
                                unitId={unit.id}
                                initialValue={initialValue}
                                rightAction={
                                  <UnitDailyExceptionModal
                                    unitId={unit.id}
                                    unitName={unit.name}
                                  />
                                }
                              />
                            </div>

                            {/* DAILY EXCEPTIONS */}
                            <div className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-4 space-y-3">
                              <div className="space-y-1">
                                <p className="text-paragraph-medium font-semibold text-content-primary">
                                  Exceções por dia
                                </p>
                                <p className="text-paragraph-small text-content-secondary">
                                  Bloqueie um dia inteiro ou defina horários
                                  específicos para uma data.
                                </p>
                              </div>

                              <UnitDailyExceptionsList unitId={unit.id} />
                            </div>
                          </section>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            )}

            {/* INATIVAS (igual “Profissionais inativos”) */}
            <div className="pt-6 space-y-3">
              <div>
                <h3 className="text-paragraph-medium font-semibold text-content-primary">
                  Unidades inativas
                </h3>
                <p className="text-paragraph-small text-content-secondary">
                  Unidades desativadas não aparecem para o cliente e não devem
                  receber novos agendamentos.
                </p>
              </div>

              {inactiveUnits.length === 0 ? (
                <div className="rounded-xl border border-border-primary bg-background-tertiary p-5 text-center text-paragraph-small text-content-secondary">
                  Nenhuma unidade inativa no momento.
                </div>
              ) : (
                <div className="space-y-2">
                  {inactiveUnits.map((unit) => (
                    <div
                      key={unit.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-border-primary bg-background-tertiary px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="text-paragraph-medium font-semibold text-content-primary truncate">
                          {unit.name}
                        </p>
                        <p className="text-xs text-content-secondary truncate">
                          Telefone:{" "}
                          <span className="text-content-primary">
                            {unit.phone || "—"}
                          </span>{" "}
                          • Endereço:{" "}
                          <span className="text-content-primary">
                            {unit.address || "—"}
                          </span>
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <UnitToggleUnitStatusButton
                          unitId={unit.id}
                          isActive={unit.isActive}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </section>

      {/* ADMINISTRADORES */}
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

          <AdminNewAdminDialog />
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
              <AdminNewAdminDialog />
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
