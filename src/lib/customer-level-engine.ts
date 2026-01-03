// src/lib/customer-level-engine.ts
"use server";

import { prisma } from "@/lib/prisma";
import {
  CustomerLevel,
  CustomerLevelRuleType,
  ClientPlanStatus,
  AppointmentStatus,
  OrderStatus,
} from "@prisma/client";

/**
 * Motor on-demand de nível do cliente.
 *
 * Ideia:
 * - Sempre que o app pedir /me (ou outra rota), chamamos este motor.
 * - Ele "fecha" o mês anterior (periodKey YYYY-MM no timezone SP).
 * - Ele calcula o earnedLevel do período e grava em CustomerLevelPeriod.
 * - Ele garante CustomerLevelState e promove o levelCurrent (defasagem M -> M+1)
 *
 * Regras:
 * 1) Regras especiais (ex: HAS_ACTIVE_PLAN) vencem configs por contagem
 * 2) Caso contrário, escolhe o maior nível cujo threshold foi atingido
 *
 * Observação:
 * - O motor é por unidade (tenant). unitId é obrigatório.
 */

const SAO_PAULO_TZ = "America/Sao_Paulo";

type EnsureArgs = {
  userId: string;
  unitId: string;
  now?: Date; // útil para testes
};

type EnsureResult = {
  unitId: string;
  userId: string;

  periodKey: string; // mês fechado (mês anterior)
  computedAt: Date;

  appointmentsDone: number;
  ordersCompleted: number;
  earnedLevel: CustomerLevel;

  state: {
    levelCurrent: CustomerLevel;
    levelEarnedLastPeriod: CustomerLevel;
    levelEffectiveFrom: Date | null;
    updatedAt: Date;
  };

  // opcional para debug em dev
  _debug?: Record<string, any>;
};

// -------------------------------
// Date helpers (timezone SP)
// -------------------------------

/**
 * Converte "agora" para componentes de data no timezone de São Paulo.
 * Não depende de libs externas; usa Intl.
 */
function getZonedParts(date: Date, timeZone: string) {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = dtf.formatToParts(date);
  const map: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== "literal") map[p.type] = p.value;
  }

  const year = Number(map.year);
  const month = Number(map.month); // 1-12
  const day = Number(map.day);
  const hour = Number(map.hour);
  const minute = Number(map.minute);
  const second = Number(map.second);

  return { year, month, day, hour, minute, second };
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

/**
 * Retorna periodKey do mês anterior ao "now" considerando timezone SP.
 * Ex: now = 2026-01-01 => periodKey = "2025-12"
 */
function previousMonthPeriodKey(now: Date): string {
  const { year, month } = getZonedParts(now, SAO_PAULO_TZ);

  let y = year;
  let m = month - 1;
  if (m <= 0) {
    m = 12;
    y = year - 1;
  }
  return `${y}-${pad2(m)}`;
}

/**
 * Dado periodKey "YYYY-MM", retorna [startUTC, endUTC) do mês em SP.
 * A query é feita em UTC no banco, então precisamos gerar os limites em UTC.
 *
 * Estratégia:
 * - Monta a data "YYYY-MM-01 00:00:00" em SP e "nextMonth-01 00:00:00" em SP
 * - Converte para UTC usando Intl (sem date-fns-tz)
 */
function monthRangeUTCFromPeriodKey(periodKey: string) {
  const m = /^(\d{4})-(\d{2})$/.exec(periodKey);
  if (!m) throw new Error(`periodKey inválido: ${periodKey}`);

  const year = Number(m[1]);
  const month = Number(m[2]); // 1-12

  // próximo mês
  let nextY = year;
  let nextM = month + 1;
  if (nextM >= 13) {
    nextM = 1;
    nextY = year + 1;
  }

  const startUtc = zonedMidnightToUTC(year, month, 1, SAO_PAULO_TZ);
  const endUtc = zonedMidnightToUTC(nextY, nextM, 1, SAO_PAULO_TZ);

  return { startUtc, endUtc };
}

/**
 * Converte "YYYY-MM-DD 00:00:00" no timezone informado para um Date UTC.
 * Implementação sem libs: usa truque de formatToParts para obter offset.
 */
function zonedMidnightToUTC(
  year: number,
  month: number, // 1-12
  day: number,
  timeZone: string,
) {
  // Começa assumindo que o horário local = UTC (aproximação)
  // depois corrige pela diferença obtida via Intl
  const approx = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));

  // Descobre como esse "approx" aparece no timezone alvo
  const parts = getZonedParts(approx, timeZone);

  // Queremos representar "year-month-day 00:00:00" em TZ alvo.
  // Calculamos a diferença entre o que obtivemos e o desejado, e corrigimos.
  const desired = { year, month, day, hour: 0, minute: 0, second: 0 };

  // Constrói datas UTC para comparar
  const gotUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  const desiredUtc = Date.UTC(
    desired.year,
    desired.month - 1,
    desired.day,
    desired.hour,
    desired.minute,
    desired.second,
  );

  const diffMs = gotUtc - desiredUtc;

  // Ajusta "approx" pelo diff para cair no instante correto
  return new Date(approx.getTime() - diffMs);
}

// -------------------------------
// Level helpers
// -------------------------------

const LEVELS_ASC: CustomerLevel[] = ["BRONZE", "PRATA", "OURO", "DIAMANTE"];

function maxLevel(a: CustomerLevel, b: CustomerLevel): CustomerLevel {
  return LEVELS_ASC.indexOf(a) >= LEVELS_ASC.indexOf(b) ? a : b;
}

function pickByThresholds(args: {
  appointmentsDone: number;
  ordersCompleted: number;
  configs: Array<{
    level: CustomerLevel;
    minAppointmentsDone: number;
    minOrdersCompleted: number;
  }>;
}): CustomerLevel {
  const { appointmentsDone, ordersCompleted, configs } = args;

  // garante ordenação do menor pro maior
  const ordered = [...configs].sort(
    (x, y) => LEVELS_ASC.indexOf(x.level) - LEVELS_ASC.indexOf(y.level),
  );

  let best: CustomerLevel = "BRONZE";

  for (const c of ordered) {
    const okA = appointmentsDone >= Number(c.minAppointmentsDone ?? 0);
    const okO = ordersCompleted >= Number(c.minOrdersCompleted ?? 0);
    if (okA && okO) best = maxLevel(best, c.level);
  }

  return best;
}

async function ruleHasActivePlan(userId: string, unitId: string, at: Date) {
  // Plano ativo no momento da execução (now)
  // Ajuste se quiser considerar "no mês fechado", mas por enquanto:
  // regra especial é "cliente tem plano ativo agora"
  const plan = await prisma.clientPlan.findFirst({
    where: {
      clientId: userId,
      status: ClientPlanStatus.ACTIVE,
      startDate: { lte: at },
      endDate: { gt: at },
      // ⚠️ ClientPlan não tem unitId no schema.
      // Se no seu negócio plano é por unidade, precisaremos adicionar unitId ou inferir por appointments.
    },
    select: { id: true },
  });

  return !!plan;
}

// -------------------------------
// Main engine
// -------------------------------

export async function ensureCustomerLevelUpToDate(
  args: EnsureArgs,
): Promise<EnsureResult> {
  const userId = String(args.userId || "").trim();
  const unitId = String(args.unitId || "").trim();
  const now = args.now instanceof Date ? args.now : new Date();

  if (!userId) throw new Error("ensureCustomerLevelUpToDate: userId inválido");
  if (!unitId) throw new Error("ensureCustomerLevelUpToDate: unitId inválido");

  const periodKey = previousMonthPeriodKey(now);
  const { startUtc, endUtc } = monthRangeUTCFromPeriodKey(periodKey);

  // Tudo em transação pra manter consistência (e evitar corrida)
  const result = await prisma.$transaction(async (tx) => {
    // 1) Garante configs (se não houver, tudo vira BRONZE)
    const configs = await tx.customerLevelConfig.findMany({
      where: { unitId },
      select: {
        level: true,
        minAppointmentsDone: true,
        minOrdersCompleted: true,
      },
    });

    // 2) Conta mês anterior (DONE + COMPLETED)
    const [appointmentsDone, ordersCompleted] = await Promise.all([
      tx.appointment.count({
        where: {
          unitId,
          clientId: userId,
          status: AppointmentStatus.DONE,
          scheduleAt: {
            gte: startUtc,
            lt: endUtc,
          },
        },
      }),
      tx.order.count({
        where: {
          unitId,
          clientId: userId,
          status: OrderStatus.COMPLETED,
          createdAt: {
            gte: startUtc,
            lt: endUtc,
          },
        },
      }),
    ]);

    // 3) Regras especiais (prioridade desc)
    const rules = await tx.customerLevelRule.findMany({
      where: { unitId, isEnabled: true },
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
      select: { type: true, targetLevel: true, priority: true },
    });

    let earnedLevel: CustomerLevel | null = null;

    for (const r of rules) {
      if (r.type === CustomerLevelRuleType.HAS_ACTIVE_PLAN) {
        const ok = await ruleHasActivePlan(userId, unitId, now);
        if (ok) {
          earnedLevel = r.targetLevel;
          break; // regra aplicada
        }
      }
    }

    // 4) fallback por thresholds
    if (!earnedLevel) {
      earnedLevel =
        configs.length > 0
          ? pickByThresholds({
              appointmentsDone,
              ordersCompleted,
              configs: configs.map((c) => ({
                level: c.level,
                minAppointmentsDone: Number(c.minAppointmentsDone ?? 0),
                minOrdersCompleted: Number(c.minOrdersCompleted ?? 0),
              })),
            })
          : "BRONZE";
    }

    // 5) Upsert do period (idempotente)
    const period = await tx.customerLevelPeriod.upsert({
      where: { unitId_userId_periodKey: { unitId, userId, periodKey } },
      create: {
        unitId,
        userId,
        periodKey,
        appointmentsDone,
        ordersCompleted,
        earnedLevel,
        computedAt: now,
      },
      update: {
        appointmentsDone,
        ordersCompleted,
        earnedLevel,
        computedAt: now,
      },
      select: {
        id: true,
        earnedLevel: true,
        appointmentsDone: true,
        ordersCompleted: true,
        computedAt: true,
      },
    });

    // 6) Upsert do state
    // Regra de defasagem M -> M+1:
    // - earnedLevel do mês anterior vira levelEarnedLastPeriod
    // - e podemos promover para levelCurrent, com levelEffectiveFrom = primeiro dia do mês atual em SP
    //
    // Aqui, como estamos sendo chamados em "now", assumimos que o mês atual já começou.
    // Então: sempre que recalcular periodKey do mês anterior, promovemos levelCurrent para esse earned.
    //
    // Se você quiser "só promove no dia 01" e manter até lá, podemos refinar depois.
    const effectiveFrom = zonedMidnightToUTC(
      // mês atual em SP
      getZonedParts(now, SAO_PAULO_TZ).year,
      getZonedParts(now, SAO_PAULO_TZ).month,
      1,
      SAO_PAULO_TZ,
    );

    const state = await tx.customerLevelState.upsert({
      where: { unitId_userId: { unitId, userId } },
      create: {
        unitId,
        userId,
        levelCurrent: earnedLevel,
        levelEarnedLastPeriod: earnedLevel,
        levelEffectiveFrom: effectiveFrom,
      },
      update: {
        levelCurrent: earnedLevel,
        levelEarnedLastPeriod: earnedLevel,
        levelEffectiveFrom: effectiveFrom,
      },
      select: {
        levelCurrent: true,
        levelEarnedLastPeriod: true,
        levelEffectiveFrom: true,
        updatedAt: true,
      },
    });

    const payload: EnsureResult = {
      unitId,
      userId,
      periodKey,
      computedAt: period.computedAt,
      appointmentsDone: period.appointmentsDone,
      ordersCompleted: period.ordersCompleted,
      earnedLevel: period.earnedLevel,
      state,
      _debug:
        process.env.NODE_ENV === "development"
          ? {
              rangeUTC: { startUtc, endUtc },
              rules,
              configsCount: configs.length,
            }
          : undefined,
    };

    return payload;
  });

  return result;
}
