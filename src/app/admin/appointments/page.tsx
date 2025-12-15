// src/app/admin/appointments/page.tsx
import { prisma } from "@/lib/prisma";
import { startOfDay, endOfDay } from "date-fns";
import type { Metadata } from "next";
import { cookies } from "next/headers";

import { DatePicker } from "@/components/date-picker";
import type { Appointment as AppointmentType } from "@/types/appointment";
import type { Service } from "@/types/service";
import { AdminAppointmentsByBarber } from "@/components/admin-appointments-by-barber";

import { requireAdminPermission } from "@/lib/admin-permissions";

import type { AppointmentClientOption } from "@/components/appointment-form";
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

async function getAppointments(
  dateParam: string | undefined,
  unitId: string | null,
) {
  let baseDate: Date;

  if (dateParam) {
    const parsed = parseDateParam(dateParam);
    baseDate = parsed ?? getSaoPauloToday();
  } else {
    baseDate = getSaoPauloToday();
  }

  const start = startOfDay(baseDate);
  const end = endOfDay(baseDate);

  const appointments = await prisma.appointment.findMany({
    where: withUnitWhere(
      {
        scheduleAt: {
          gte: start,
          lte: end,
        },
      },
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
    },
  });

  return appointments;
}

/**
 * ✅ Barber NÃO tem unitId direto (ele é N:N via BarberUnit).
 * Então o filtro por unidade é: units.some({ unitId, isActive:true })
 */
async function getBarbers(unitId: string | null) {
  const barbers = await prisma.barber.findMany({
    where: {
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
    },
    orderBy: { name: "asc" },
    include: {
      // pivot BarberUnit -> precisamos só do unitId
      units: {
        where: { isActive: true },
        select: { unitId: true, isActive: true },
      },
      // pivot ServiceProfessional -> precisamos só do serviceId
      services: {
        select: { serviceId: true },
      },
    },
  });

  return barbers;
}

async function getServices(): Promise<Service[]> {
  const services = await prisma.service.findMany({
    where: { isActive: true },
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

// Clientes = Users com role CLIENT (porque prisma.client não existe no seu schema)
async function getClientsForAdminAppointments(): Promise<
  AppointmentClientOption[]
> {
  const clients = await prisma.user.findMany({
    where: { role: "CLIENT" },
    orderBy: { name: "asc" },
    take: 500,
    select: {
      id: true,
      name: true,
      phone: true,
    },
  });

  return clients.map(
    (c: { id: string; name: string | null; phone: string | null }) => ({
      id: c.id,
      name: c.name ?? "",
      phone: c.phone ?? "",
    }),
  );
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
  };
}

export default async function AdminAppointmentsPage({
  searchParams,
}: AdminAppointmentsPageProps) {
  const admin = await requireAdminPermission("canAccessAppointments");

  // ✅ Unidade ativa para todas as queries
  const activeUnitId = await resolveUnitScope({
    unitId: admin.unitId ?? null,
    canSeeAllUnits: !!admin.canSeeAllUnits,
  });

  // ✅ scope do FORM: dono vê tudo (null), admin de unidade fica travado
  const formScopeUnitId = admin.canSeeAllUnits ? null : activeUnitId;

  const resolvedSearchParams = await searchParams;
  const dateParam = resolvedSearchParams.date;

  const todaySP = getSaoPauloToday();

  const selectedDate = dateParam
    ? (parseDateParam(dateParam) ?? todaySP)
    : todaySP;

  const dayStart = startOfDay(selectedDate);
  const dayEnd = endOfDay(selectedDate);

  const [
    appointmentsPrisma,
    barbersPrismaForForm,
    servicesForForm,
    dayProductSalesPrisma,
    clientsForAdmin,
  ] = await Promise.all([
    // ✅ A TELA segue o contexto de unidade ativo
    getAppointments(dateParam, activeUnitId),

    // ✅ O MODAL precisa poder trocar unidade (quando dono)
    getBarbers(formScopeUnitId),
    getServices(),

    prisma.productSale.findMany({
      where: {
        soldAt: { gte: dayStart, lte: dayEnd },
        ...(activeUnitId
          ? {
              product: {
                unitId: activeUnitId,
              },
            }
          : {}),
      } as any,
      include: { product: true, barber: true },
    }),

    getClientsForAdminAppointments(),
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

  // ✅ só filtra se for admin de unidade (travado). Dono recebe lista global.
  const safeBarbersForForm = admin.canSeeAllUnits
    ? barbersForForm
    : activeUnitId
      ? barbersForForm.filter((b: any) =>
          (b.unitIds ?? []).includes(String(activeUnitId)),
        )
      : barbersForForm;

  type AppointmentWithBarberPrisma = (typeof appointmentsPrisma)[number];
  type DayProductSale = (typeof dayProductSalesPrisma)[number];

  /* ------------------------------------------------------------------
   * CÁLCULO DE CRÉDITOS DE PLANO POR AGENDAMENTO
   * ------------------------------------------------------------------*/
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
      {/* HEADER + DATA + BOTÃO */}
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
          />

          <DatePicker />
        </div>
      </div>

      {appointmentsPrisma.length === 0 && dayProductSalesPrisma.length === 0 ? (
        <section className="border border-border-primary rounded-xl overflow-hidden bg-background-tertiary">
          <div className="border-b border-border-primary px-4 py-3 bg-muted/40 flex justify-between items-center">
            <p className="font-medium">Agendamentos e vendas de produto</p>
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
              />
            );
          })}
        </section>
      )}
    </div>
  );
}
