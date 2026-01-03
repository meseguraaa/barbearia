// src/app/admin/appointments/page.tsx
import { prisma } from "@/lib/prisma";
import {
  startOfDay,
  endOfDay,
  startOfDay as startOfDayFns,
  endOfDay as endOfDayFns,
} from "date-fns";
import type { Metadata } from "next";
import { cookies } from "next/headers";

import { DatePicker } from "@/components/date-picker";
import type { Appointment as AppointmentType } from "@/types/appointment";
import type { Service } from "@/types/service";
import { AdminAppointmentsByBarber } from "@/components/admin-appointments-by-barber";

import { requireAdminPermission } from "@/lib/admin-permissions";

import type {
  AppointmentClientOption,
  UnitOption,
} from "@/components/appointment-form";
import { AdminNewAppointmentButton } from "@/components/admin-new-appointment-button";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin | Agendamentos",
};

type AdminAppointmentsPageProps = {
  searchParams: Promise<{
    date?: string;
  }>;
};

const SAO_PAULO_TIMEZONE = "America/Sao_Paulo";
const UNIT_COOKIE_NAME = "admin_unit_context";
const UNIT_ALL_VALUE = "all";

function getSaoPauloToday(): Date {
  const now = new Date();

  const formatter = new Intl.DateTimeFormat("pt-BR", {
    timeZone: SAO_PAULO_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(now);
  const day = Number(parts.find((p) => p.type === "day")?.value ?? "1");
  const month = Number(parts.find((p) => p.type === "month")?.value ?? "1");
  const year = Number(parts.find((p) => p.type === "year")?.value ?? "1970");

  return new Date(year, month - 1, day);
}

function parseDateParam(dateStr?: string): Date | null {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

/**
 * Resolve o "escopo" de unidade para as queries do admin.
 * - Dono: respeita cookie (all = tudo)
 * - Admin de unidade: ignora cookie e força unitId do admin
 */
async function resolveUnitScope(admin: {
  unitId: string | null;
  canSeeAllUnits: boolean;
}) {
  if (!admin.canSeeAllUnits) return admin.unitId;

  const cookieStore = await cookies();
  const cookieValue =
    cookieStore.get(UNIT_COOKIE_NAME)?.value ?? UNIT_ALL_VALUE;

  if (!cookieValue || cookieValue === UNIT_ALL_VALUE) return null;
  return cookieValue;
}

/**
 * Helper pra aplicar unitId sem espalhar if em todo lugar.
 * (Só use onde o model realmente tem unitId.)
 */
function withUnitWhere<T extends Record<string, any>>(
  base: T,
  unitId: string | null,
) {
  if (!unitId) return base;
  return { ...(base as any), unitId } as T;
}

/**
 * ✅ Multi-tenant helper (companyId SEMPRE obrigatório)
 */
function withCompanyWhere<T extends Record<string, any>>(
  base: T,
  companyId: string,
) {
  return { ...(base as any), companyId } as T;
}

async function getAppointments(
  dateParam: string | undefined,
  args: { companyId: string; unitId: string | null },
) {
  const { companyId, unitId } = args;

  const baseDate = dateParam
    ? (parseDateParam(dateParam) ?? getSaoPauloToday())
    : getSaoPauloToday();

  const start = startOfDay(baseDate);
  const end = endOfDay(baseDate);

  const appointments = await prisma.appointment.findMany({
    where: withUnitWhere(
      withCompanyWhere(
        {
          scheduleAt: {
            gte: start,
            lte: end,
          },
        },
        companyId,
      ),
      unitId,
    ) as any,
    orderBy: {
      scheduleAt: "asc",
    },
    include: {
      barber: {
        include: {
          user: true,
        },
      },
      service: true,
      client: true,
      clientPlan: {
        include: {
          plan: true,
        },
      },

      // ✅ auditoria de ator (pra mostrar "Cancelado/Concluído por Nome")
      concludedByUser: true,
      concludedByBarber: true,
      cancelledByUser: true,
      cancelledByBarber: true,
    },
  });

  return appointments;
}

/**
 * ✅ Barber NÃO tem unitId direto (ele é N:N via BarberUnit).
 * Então o filtro por unidade é: units.some({ unitId, isActive:true })
 * ✅ Multi-tenant: SEMPRE filtrar por companyId
 */
async function getBarbers(args: { companyId: string; unitId: string | null }) {
  const { companyId, unitId } = args;

  const barbers = await prisma.barber.findMany({
    where: {
      companyId,
      isActive: true,
      ...(unitId
        ? {
            units: {
              some: {
                unitId,
                isActive: true,
              },
            },
          }
        : {}),
    } as any,
    orderBy: { name: "asc" },
    include: {
      units: {
        where: { isActive: true },
        select: { unitId: true, isActive: true },
      },
      services: {
        select: { serviceId: true },
      },
    },
  });

  return barbers;
}

async function getServices(companyId: string): Promise<Service[]> {
  const services = await prisma.service.findMany({
    where: { companyId, isActive: true } as any,
    orderBy: { name: "asc" },
  });

  return services.map((s) => ({
    id: s.id,
    name: s.name,
    price: Number(s.price),
    durationMinutes: s.durationMinutes,
    isActive: s.isActive,
  }));
}

async function getInitialClientsForAdminAppointments(args: {
  companyId: string;
  unitId: string | null;
}): Promise<AppointmentClientOption[]> {
  const { companyId, unitId } = args;

  /**
   * ✅ Correção multi-tenant:
   * - User NÃO tem companyId
   * - cliente pertence à empresa via CompanyMember (companyMemberships)
   * - NÃO filtrar name != null (senão você perde clientes válidos)
   */

  const anonEmail = `anon+${companyId}@barbearia.local`;

  // 1) clientes "oficiais" da company via membership
  const clientsByMembership = await prisma.user.findMany({
    where: {
      role: "CLIENT",
      isActive: true,
      email: { not: anonEmail },

      // ✅ tenant-safe correto
      companyMemberships: {
        some: { companyId, isActive: true },
      },
    } as any,
    orderBy: { name: "asc" },
    take: 200,
    select: {
      id: true,
      name: true,
      phone: true,
    },
  });

  if (clientsByMembership.length > 0) {
    return clientsByMembership.map(
      (c: { id: string; name: string | null; phone: string | null }) => ({
        id: c.id,
        name: (c.name ?? "").trim(),
        phone: (c.phone ?? "").trim(),
      }),
    );
  }

  // 2) fallback: comportamento antigo (clientes que já têm appointment nessa company/unidade)
  // (mantém compat caso a base esteja "bagunçada" e membership ainda não esteja completo)
  const clientsWithHistory = await prisma.user.findMany({
    where: {
      role: "CLIENT",
      isActive: true,
      email: { not: anonEmail },
      appointmentsAsClient: {
        some: {
          companyId,
          ...(unitId ? { unitId } : {}),
        } as any,
      },
    } as any,
    orderBy: { name: "asc" },
    take: 200,
    select: {
      id: true,
      name: true,
      phone: true,
    },
  });

  return clientsWithHistory.map(
    (c: { id: string; name: string | null; phone: string | null }) => ({
      id: c.id,
      name: (c.name ?? "").trim(),
      phone: (c.phone ?? "").trim(),
    }),
  );
}

/**
 * ✅ No ADMIN precisamos enviar as unidades (id + name) pro AppointmentForm
 * para o select de unidade renderizar corretamente (principalmente no EDIT).
 *
 * - Dono (canSeeAllUnits): manda todas ativas
 * - Admin de unidade: manda só a unidade dele (1 item)
 * ✅ Multi-tenant: SEMPRE filtrar por companyId
 */
async function getUnitsForAdminAppointments(args: {
  companyId: string;
  activeUnitId: string | null;
  canSeeAllUnits: boolean;
}): Promise<UnitOption[]> {
  const { companyId, activeUnitId, canSeeAllUnits } = args;

  const units = await prisma.unit.findMany({
    where: {
      companyId,
      isActive: true,
      ...(canSeeAllUnits ? {} : activeUnitId ? { id: activeUnitId } : {}),
    } as any,
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      isActive: true,
    },
  });

  return units.map((u) => ({
    id: u.id,
    name: u.name,
    isActive: u.isActive,
  }));
}

function mapToAppointmentType(prismaAppt: any): AppointmentType {
  return {
    id: prismaAppt.id,
    clientName: prismaAppt.clientName,
    phone: prismaAppt.phone,
    description: prismaAppt.description,
    scheduleAt: prismaAppt.scheduleAt,
    status: prismaAppt.status ?? "PENDING",
    barberId: prismaAppt.barberId ?? "",
    barber: prismaAppt.barber
      ? {
          id: prismaAppt.barber.id,
          name: prismaAppt.barber.name ?? "",
          email: prismaAppt.barber.email ?? "",
          phone: prismaAppt.barber.phone,
          isActive: prismaAppt.barber.isActive,
          role: "BARBER",
        }
      : undefined,
    serviceId: prismaAppt.serviceId ?? undefined,

    // ✅ ESSENCIAL pro EDIT funcionar
    unitId: prismaAppt.unitId ?? undefined,
  } as any;
}

export default async function AdminAppointmentsPage({
  searchParams,
}: AdminAppointmentsPageProps) {
  const admin = await requireAdminPermission("canAccessAppointments");

  // ✅ Multi-tenant hard stop
  const companyId = String((admin as any)?.companyId ?? "");
  if (!companyId) {
    throw new Error(
      "Admin sem companyId definido. Este painel é multi-tenant: vincule o admin a uma empresa (companyId).",
    );
  }

  // ✅ Escopo de unidade (por cima do company)
  const activeUnitId = await resolveUnitScope({
    unitId: admin.unitId ?? null,
    canSeeAllUnits: !!admin.canSeeAllUnits,
  });

  // admin de unidade não pode ficar sem unitId
  if (!admin.canSeeAllUnits && !activeUnitId) {
    throw new Error(
      "Admin de unidade sem unitId definido. Vincule este admin a uma unidade.",
    );
  }

  // No form: dono pode criar em qualquer unidade (unitId null => mostra select)
  const formScopeUnitId = admin.canSeeAllUnits ? null : activeUnitId;

  const resolvedSearchParams = await searchParams;
  const dateParam = resolvedSearchParams.date;

  const todaySP = getSaoPauloToday();

  const selectedDate = dateParam
    ? (parseDateParam(dateParam) ?? todaySP)
    : todaySP;

  const dayStart = startOfDayFns(selectedDate);
  const dayEnd = endOfDayFns(selectedDate);

  const [
    appointmentsPrisma,
    barbersPrismaForForm,
    servicesForForm,
    dayProductSalesPrisma,
    clientsForAdmin,
    unitsForForm,
  ] = await Promise.all([
    getAppointments(dateParam, { companyId, unitId: activeUnitId }),
    getBarbers({ companyId, unitId: formScopeUnitId }),
    getServices(companyId),

    // ✅ Vendas do dia (multi-tenant + unidade)
    prisma.productSale.findMany({
      where: {
        soldAt: { gte: dayStart, lte: dayEnd },

        // tenta primeiro filtrar por companyId no próprio ProductSale
        ...(companyId ? { companyId } : {}),

        // unidade: cobre dois schemas comuns
        ...(activeUnitId
          ? {
              OR: [
                { unitId: activeUnitId },
                {
                  product: {
                    unitId: activeUnitId,
                  },
                },
              ],
            }
          : {}),
      } as any,
      include: { product: true, barber: true },
    }),

    getInitialClientsForAdminAppointments({
      companyId,
      unitId: formScopeUnitId,
    }),

    getUnitsForAdminAppointments({
      companyId,
      activeUnitId,
      canSeeAllUnits: !!admin.canSeeAllUnits,
    }),
  ]);

  const appointmentsForForm = appointmentsPrisma.map(mapToAppointmentType);

  const barbersForForm = barbersPrismaForForm.map((barber: any) => ({
    id: barber.id,
    name: barber.name ?? "",
    email: barber.email ?? "",
    phone: barber.phone ?? "",
    isActive: barber.isActive,
    role: "BARBER" as const,

    unitIds: (barber.units ?? [])
      .filter((u: any) => u.isActive !== false)
      .map((u: any) => u.unitId),

    serviceIds: (barber.services ?? []).map((s: any) => s.serviceId),
  }));

  const safeBarbersForForm = admin.canSeeAllUnits
    ? barbersForForm
    : activeUnitId
      ? barbersForForm.filter((b: any) =>
          (b.unitIds ?? []).includes(String(activeUnitId)),
        )
      : barbersForForm;

  type AppointmentWithBarberPrisma = (typeof appointmentsPrisma)[number];
  type DayProductSale = (typeof dayProductSalesPrisma)[number];

  const planCreditInfoByAppointmentId: Record<
    string,
    {
      isPlanCredit: boolean;
      planCreditIndex: number | null;
      planTotalCredits: number | null;
    }
  > = {};

  const appointmentsByClientPlan = appointmentsPrisma.reduce<
    Record<string, AppointmentWithBarberPrisma[]>
  >((acc, appt) => {
    if (!appt.clientPlanId || !appt.clientPlan || !appt.clientPlan.plan) {
      return acc;
    }

    const key = appt.clientPlanId;
    if (!acc[key]) acc[key] = [];
    acc[key].push(appt);
    return acc;
  }, {});

  Object.values(appointmentsByClientPlan).forEach((apptsForPlan) => {
    if (apptsForPlan.length === 0) return;

    const validAppts = apptsForPlan.filter(
      (appt) => appt.status !== "CANCELED",
    );
    if (validAppts.length === 0) return;

    const first = validAppts[0];
    const totalCredits = first.clientPlan!.plan.totalBookings;

    validAppts.sort((a, b) => a.scheduleAt.getTime() - b.scheduleAt.getTime());

    validAppts.forEach((appt, index) => {
      const creditIndex = index + 1;
      const withinCredits = creditIndex <= totalCredits;

      planCreditInfoByAppointmentId[appt.id] = {
        isPlanCredit: withinCredits,
        planCreditIndex: withinCredits ? creditIndex : null,
        planTotalCredits: totalCredits,
      };
    });
  });

  const groupedByBarber = appointmentsPrisma.reduce<
    Record<
      string,
      {
        barberId: string | null;
        barberName: string;
        barberImageUrl: string | null;
        appointments: AppointmentWithBarberPrisma[];
      }
    >
  >((acc, appt) => {
    const barberId = appt.barberId ?? "no-barber";
    const barberName = appt.barber?.name ?? "Sem barbeiro";
    const barberImageUrl = appt.barber?.user?.image ?? null;

    if (!acc[barberId]) {
      acc[barberId] = {
        barberId: appt.barberId ?? null,
        barberName,
        barberImageUrl,
        appointments: [],
      };
    }

    acc[barberId].appointments.push(appt);
    return acc;
  }, {});

  const productSalesByBarber = dayProductSalesPrisma.reduce<
    Record<string, DayProductSale[]>
  >((acc, sale) => {
    const barberId = sale.barberId ?? "no-barber";
    if (!acc[barberId]) acc[barberId] = [];
    acc[barberId].push(sale);
    return acc;
  }, {});

  const barberGroups = Object.values(groupedByBarber);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-title text-content-primary">Agendamentos</h1>
          <p className="text-paragraph-medium-size text-content-secondary">
            Gerencie os agendamentos e vendas de produtos do dia, organizados
            por barbeiro.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <AdminNewAppointmentButton
            clients={clientsForAdmin}
            appointments={appointmentsForForm}
            barbers={safeBarbersForForm}
            services={servicesForForm}
            unitId={formScopeUnitId}
            units={unitsForForm}
          />

          <DatePicker />
        </div>
      </div>

      {appointmentsPrisma.length === 0 && dayProductSalesPrisma.length === 0 ? (
        <section className="border border-border-primary rounded-xl overflow-hidden bg-background-tertiary">
          <div className="border-b border-border-primary px-4 py-3 bg-muted/40 flex justify-between items-center">
            <p className="font-medium">Agendamentos</p>
          </div>
          <div className="p-6 text-paragraph-small text-content-secondary text-center">
            Nenhum agendamento ou venda de produto encontrada para esta data.
          </div>
        </section>
      ) : (
        <section className="space-y-4">
          {barberGroups.map((group) => {
            const barberKey = group.barberId ?? "no-barber";
            const salesForBarber = productSalesByBarber[barberKey] ?? [];

            return (
              <AdminAppointmentsByBarber
                key={group.barberId ?? "no-barber"}
                group={group}
                salesCount={salesForBarber.length}
                appointmentsForForm={appointmentsForForm}
                barbersForForm={barbersForForm}
                services={servicesForForm}
                planCreditInfoByAppointmentId={planCreditInfoByAppointmentId}
                units={unitsForForm}
              />
            );
          })}
        </section>
      )}
    </div>
  );
}
