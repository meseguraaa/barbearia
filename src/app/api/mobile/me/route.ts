// src/app/api/mobile/me/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAppJwt } from "@/lib/app-jwt";
import { ensureCustomerLevelUpToDate } from "@/lib/customer-level-engine";

type MobileTokenPayload = {
  sub: string;
  role?: "CLIENT" | "BARBER" | "ADMIN";
  companyId: string; // ✅ fonte da verdade do tenant
  profile_complete?: boolean;

  // compat/logs
  email?: string;
  name?: string | null;
};

function getBearerToken(req: Request): string | null {
  const auth =
    req.headers.get("authorization") || req.headers.get("Authorization");
  if (!auth) return null;

  const [type, token] = auth.split(" ");
  if (type?.toLowerCase() !== "bearer" || !token) return null;

  return token.trim();
}

// (debug apenas) header do tenant (case-insensitive)
function getCompanyIdFromHeader(req: Request): string | null {
  const raw =
    req.headers.get("x-company-id") ||
    req.headers.get("X-Company-Id") ||
    req.headers.get("x-companyid") ||
    req.headers.get("X-CompanyId");

  const v = typeof raw === "string" ? raw.trim() : "";
  return v.length ? v : null;
}

/**
 * ⚠️ IMPORTANTE:
 * Seus logs mostram que `User` NÃO tem o campo `adminAccess` (ele existe como relação `adminAccesses`).
 * Então aqui NÃO selecionamos `adminAccess` para não estourar PrismaClientValidationError.
 * Se você precisar de adminAccess no mobile depois, buscamos via tabela/relacionamento separado.
 */
function selectUser() {
  return {
    id: true,
    name: true,
    email: true,
    role: true,
    image: true,
    phone: true,
    birthday: true,
    isOwner: true,
    isActive: true,
    createdAt: true,
    updatedAt: true,
  } as const;
}

function parseBirthday(input: unknown): Date | null {
  if (input === null || input === undefined || input === "") return null;
  if (typeof input !== "string") return null;

  const s = input.trim();

  // ISO
  const iso = new Date(s);
  if (!Number.isNaN(iso.getTime())) return iso;

  // BR dd/mm/aaaa
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  if (m) {
    const dd = Number(m[1]);
    const mm = Number(m[2]);
    const yyyy = Number(m[3]);
    const d = new Date(Date.UTC(yyyy, mm - 1, dd));
    if (!Number.isNaN(d.getTime())) return d;
  }

  return null;
}

function computeProfileStatus(user: {
  phone: string | null;
  birthday: Date | null;
}) {
  const missingFields: Array<"phone" | "birthday"> = [];
  const phoneOk =
    typeof user.phone === "string" && user.phone.trim().length > 0;
  const birthdayOk =
    user.birthday instanceof Date && !Number.isNaN(user.birthday.getTime());

  if (!phoneOk) missingFields.push("phone");
  if (!birthdayOk) missingFields.push("birthday");

  return {
    profileComplete: missingFields.length === 0,
    missingFields,
  };
}

type CustomerLevelDTO = {
  level: "BRONZE" | "PRATA" | "OURO" | "DIAMANTE";
  label: string;
  icon: string;
};

function levelToDTO(levelRaw: any): CustomerLevelDTO {
  const level = String(levelRaw || "BRONZE").toUpperCase();

  switch (level) {
    case "DIAMANTE":
      return { level: "DIAMANTE", label: "Diamante", icon: "diamond" };
    case "OURO":
      return { level: "OURO", label: "Ouro", icon: "trophy" };
    case "PRATA":
      return { level: "PRATA", label: "Prata", icon: "star" };
    case "BRONZE":
    default:
      return { level: "BRONZE", label: "Bronze", icon: "star-o" };
  }
}

/**
 * Decide a unidade “ativa” do cliente para nível.
 *
 * Ordem:
 * 1) unidade do próximo appointment PENDING (lookback 24h)
 * 2) unidade do último appointment do cliente
 * 3) fallback: primeira unit ativa (ou primeira de todas)
 *
 * ✅ MULTI-TENANT: tudo filtrado por companyId.
 */
async function resolveClientUnitId(args: {
  userId: string;
  companyId: string;
}): Promise<string | null> {
  const { userId, companyId } = args;
  const now = new Date();

  const LOOKBACK_HOURS = 24;
  const lookbackStart = new Date(
    now.getTime() - LOOKBACK_HOURS * 60 * 60 * 1000,
  );

  const next = await prisma.appointment.findFirst({
    where: {
      companyId, // ✅ tenant scope
      clientId: userId,
      status: "PENDING",
      scheduleAt: { gte: lookbackStart },
    },
    orderBy: { scheduleAt: "asc" },
    select: { unitId: true },
  });

  if (next?.unitId) return next.unitId;

  const lastAny = await prisma.appointment.findFirst({
    where: {
      companyId, // ✅ tenant scope
      clientId: userId,
    },
    orderBy: { scheduleAt: "desc" },
    select: { unitId: true },
  });

  if (lastAny?.unitId) return lastAny.unitId;

  const unit =
    (await prisma.unit.findFirst({
      where: { companyId, isActive: true }, // ✅ tenant scope
      select: { id: true },
      orderBy: { createdAt: "asc" },
    })) ??
    (await prisma.unit.findFirst({
      where: { companyId }, // ✅ tenant scope
      select: { id: true },
      orderBy: { createdAt: "asc" },
    }));

  return unit?.id ?? null;
}

/**
 * ✅ Garante que unitId pertence ao companyId antes de usar.
 * (Evita usar unitId “vazado” de outro tenant em qualquer lookup de nível.)
 */
async function ensureUnitBelongsToCompany(args: {
  unitId: string;
  companyId: string;
}): Promise<boolean> {
  try {
    const u = await prisma.unit.findFirst({
      where: { id: args.unitId, companyId: args.companyId },
      select: { id: true },
    });
    return !!u;
  } catch {
    return false;
  }
}

async function getUserLevelForUnit(userId: string, unitId: string) {
  // ⚠️ CustomerLevelState parece ser keyed por unitId+userId (sem companyId).
  // A proteção tenant vem de garantir que unitId pertence ao companyId ANTES.
  const state = await prisma.customerLevelState.findUnique({
    where: { unitId_userId: { unitId, userId } },
    select: {
      levelCurrent: true,
      unitId: true,
      levelEffectiveFrom: true,
      updatedAt: true,
    },
  });

  const dto = levelToDTO(state?.levelCurrent);
  return {
    customerLevel: dto,
    _debugLevelState: state,
  };
}

// -----------------------------
// ✅ Guard: evita rodar o motor toda hora
// -----------------------------
function getSaoPauloYearMonth(now: Date): { year: number; month: number } {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  });

  const parts = dtf.formatToParts(now);
  const map: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== "literal") map[p.type] = p.value;
  }

  return { year: Number(map.year), month: Number(map.month) };
}

function previousMonthPeriodKeySP(now: Date): string {
  const { year, month } = getSaoPauloYearMonth(now);

  let y = year;
  let m = month - 1;
  if (m <= 0) {
    m = 12;
    y = year - 1;
  }

  const mm = String(m).padStart(2, "0");
  return `${y}-${mm}`;
}

async function shouldRunCustomerLevelEngine(args: {
  userId: string;
  unitId: string;
  now: Date;
}): Promise<boolean> {
  const periodKey = previousMonthPeriodKeySP(args.now);

  const existing = await prisma.customerLevelPeriod.findUnique({
    where: {
      unitId_userId_periodKey: {
        unitId: args.unitId,
        userId: args.userId,
        periodKey,
      },
    },
    select: { id: true },
  });

  return !existing;
}

/**
 * ✅ Não confundir erro interno com "token inválido".
 * Se o problema for Prisma/schema/etc => 500 (não desloga).
 */
function buildMeErrorResponse(err: any) {
  const msg = String(err?.message || "");
  const lower = msg.toLowerCase();

  const isTokenish =
    lower.includes("invalid token payload") ||
    lower.includes("jwt") ||
    lower.includes("token") ||
    lower.includes("signature") ||
    lower.includes("missing_company_id") ||
    lower.includes("missing token payload") ||
    lower.includes("missing companyid");

  if (isTokenish) {
    return NextResponse.json({ error: "invalid_token" }, { status: 401 });
  }

  return NextResponse.json(
    {
      error: "server_error",
      ...(process.env.NODE_ENV === "development"
        ? { debug: { message: msg } }
        : {}),
    },
    { status: 500 },
  );
}

export async function GET(req: Request) {
  try {
    const bearer = getBearerToken(req);
    if (!bearer) {
      return NextResponse.json({ error: "missing_token" }, { status: 401 });
    }

    const payload = (await verifyAppJwt(bearer)) as MobileTokenPayload;

    const userId = String(payload.sub || "").trim();
    const companyId = String((payload as any).companyId || "").trim();

    if (!userId) {
      return NextResponse.json({ error: "invalid_token" }, { status: 401 });
    }

    if (!companyId) {
      return NextResponse.json(
        { error: "missing_company_id" },
        { status: 401 },
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: selectUser(),
    });

    if (!user) {
      return NextResponse.json({ error: "user_not_found" }, { status: 401 });
    }

    if (!user.isActive) {
      return NextResponse.json({ error: "user_inactive" }, { status: 403 });
    }

    const now = new Date();

    // ✅ resolve unidade (tenant-safe)
    let unitId = await resolveClientUnitId({ userId, companyId });

    // ✅ se por algum motivo vier algo fora do tenant, zera
    if (unitId) {
      const ok = await ensureUnitBelongsToCompany({ unitId, companyId });
      if (!ok) unitId = null;
    }

    // ✅ roda motor on-demand (se tiver unitId) + guard
    if (unitId) {
      try {
        const run = await shouldRunCustomerLevelEngine({ userId, unitId, now });
        if (run) {
          await ensureCustomerLevelUpToDate({ userId, unitId, now });
        }
      } catch (e) {
        console.error("[api/mobile/me] level engine error:", e);
      }
    }

    // ✅ pega nível DA unidade resolvida (ou BRONZE fallback)
    const { customerLevel, _debugLevelState } = unitId
      ? await getUserLevelForUnit(userId, unitId)
      : { customerLevel: levelToDTO("BRONZE"), _debugLevelState: null as any };

    const { profileComplete, missingFields } = computeProfileStatus({
      phone: user.phone ?? null,
      birthday: user.birthday ?? null,
    });

    const headerCid = getCompanyIdFromHeader(req);

    const res = NextResponse.json({
      user: {
        ...user,
        customerLevel,

        // ✅ compat: o app pode esperar essa chave
        adminAccess: null,

        // ✅ tenant no payload (sempre do token)
        companyId,

        profileComplete,
        missingFields,
      },

      profileComplete,

      // ✅ top-level (telemetria/debug)
      companyId,

      _debug:
        process.env.NODE_ENV === "development"
          ? {
              unitIdResolved: unitId,
              levelState: _debugLevelState,
              companyIdFromToken: companyId,
              companyHeader: headerCid,
              headerMismatch: headerCid ? headerCid !== companyId : false,
            }
          : undefined,
    });

    // ✅ também devolve header pra inspeção no proxy
    res.headers.set("x-company-id", companyId);

    return res;
  } catch (err) {
    console.error("[api/mobile/me] GET error:", err);
    return buildMeErrorResponse(err);
  }
}

export async function PATCH(req: Request) {
  try {
    const bearer = getBearerToken(req);
    if (!bearer) {
      return NextResponse.json({ error: "missing_token" }, { status: 401 });
    }

    const payload = (await verifyAppJwt(bearer)) as MobileTokenPayload;

    const userId = String(payload.sub || "").trim();
    const companyId = String((payload as any).companyId || "").trim();

    if (!userId) {
      return NextResponse.json({ error: "invalid_token" }, { status: 401 });
    }

    if (!companyId) {
      return NextResponse.json(
        { error: "missing_company_id" },
        { status: 401 },
      );
    }

    const existing = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, isActive: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "user_not_found" }, { status: 401 });
    }

    if (!existing.isActive) {
      return NextResponse.json({ error: "user_inactive" }, { status: 403 });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    }

    const phoneRaw = (body as any).phone as unknown;
    const birthdayRaw = (body as any).birthday as unknown;

    let phone: string | null | undefined = undefined;
    if (phoneRaw === null) {
      phone = null;
    } else if (typeof phoneRaw === "string") {
      const p = phoneRaw.trim();
      phone = p.length ? p : null;

      if (phone && phone.length > 32) {
        return NextResponse.json({ error: "phone_too_long" }, { status: 400 });
      }
    } else if (phoneRaw !== undefined) {
      return NextResponse.json({ error: "invalid_phone" }, { status: 400 });
    }

    let birthday: Date | null | undefined = undefined;
    if (birthdayRaw !== undefined) {
      const parsed = parseBirthday(birthdayRaw);
      if (birthdayRaw && !parsed) {
        return NextResponse.json(
          { error: "invalid_birthday" },
          { status: 400 },
        );
      }
      birthday = parsed;
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(phone !== undefined ? { phone } : {}),
        ...(birthday !== undefined ? { birthday } : {}),
      },
      select: selectUser(),
    });

    const now = new Date();

    // ✅ resolve unidade (tenant-safe)
    let unitId = await resolveClientUnitId({ userId, companyId });

    // ✅ garante que unit pertence ao tenant
    if (unitId) {
      const ok = await ensureUnitBelongsToCompany({ unitId, companyId });
      if (!ok) unitId = null;
    }

    // ✅ roda motor on-demand (se tiver unitId) + guard
    if (unitId) {
      try {
        const run = await shouldRunCustomerLevelEngine({ userId, unitId, now });
        if (run) {
          await ensureCustomerLevelUpToDate({ userId, unitId, now });
        }
      } catch (e) {
        console.error("[api/mobile/me] level engine error:", e);
      }
    }

    const { customerLevel, _debugLevelState } = unitId
      ? await getUserLevelForUnit(userId, unitId)
      : { customerLevel: levelToDTO("BRONZE"), _debugLevelState: null as any };

    const { profileComplete, missingFields } = computeProfileStatus({
      phone: user.phone ?? null,
      birthday: user.birthday ?? null,
    });

    const headerCid = getCompanyIdFromHeader(req);

    const res = NextResponse.json({
      user: {
        ...user,
        customerLevel,

        // ✅ compat: o app pode esperar essa chave
        adminAccess: null,

        // ✅ tenant no payload
        companyId,

        profileComplete,
        missingFields,
      },
      profileComplete,
      companyId,
      _debug:
        process.env.NODE_ENV === "development"
          ? {
              unitIdResolved: unitId,
              levelState: _debugLevelState,
              companyIdFromToken: companyId,
              companyHeader: headerCid,
              headerMismatch: headerCid ? headerCid !== companyId : false,
            }
          : undefined,
    });

    res.headers.set("x-company-id", companyId);

    return res;
  } catch (err) {
    console.error("[api/mobile/me] PATCH error:", err);
    return buildMeErrorResponse(err);
  }
}
