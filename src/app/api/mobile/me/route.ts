// src/app/api/mobile/me/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAppJwt } from "@/lib/app-jwt";

function getBearerToken(req: Request): string | null {
  const auth =
    req.headers.get("authorization") || req.headers.get("Authorization");
  if (!auth) return null;

  const [type, token] = auth.split(" ");
  if (type?.toLowerCase() !== "bearer" || !token) return null;

  return token.trim();
}

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
    adminAccess: true,
    createdAt: true,
    updatedAt: true,
  } as const;
}

function parseBirthday(input: unknown): Date | null {
  if (input === null || input === undefined || input === "") return null;

  if (typeof input !== "string") return null;

  const s = input.trim();

  // Aceita ISO: 1994-02-10 ou 1994-02-10T00:00:00.000Z
  const iso = new Date(s);
  if (!Number.isNaN(iso.getTime())) return iso;

  // Aceita BR: dd/mm/aaaa
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

export async function GET(req: Request) {
  try {
    const bearer = getBearerToken(req);
    if (!bearer) {
      return NextResponse.json({ error: "missing_token" }, { status: 401 });
    }

    const payload = await verifyAppJwt(bearer);
    const userId = payload.sub;

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

    return NextResponse.json({ user });
  } catch (err) {
    console.error("[api/mobile/me] GET error:", err);
    return NextResponse.json({ error: "invalid_token" }, { status: 401 });
  }
}

export async function PATCH(req: Request) {
  try {
    const bearer = getBearerToken(req);
    if (!bearer) {
      return NextResponse.json({ error: "missing_token" }, { status: 401 });
    }

    const payload = await verifyAppJwt(bearer);
    const userId = payload.sub;

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
      // deixa vazio virar null
      phone = p.length ? p : null;

      // validação simples (evita lixo enorme)
      if (phone && phone.length > 32) {
        return NextResponse.json({ error: "phone_too_long" }, { status: 400 });
      }
    } else if (phoneRaw !== undefined) {
      return NextResponse.json({ error: "invalid_phone" }, { status: 400 });
    }

    let birthday: Date | null | undefined = undefined;
    if (birthdayRaw !== undefined) {
      const parsed = parseBirthday(birthdayRaw);
      // se mandou algo inválido, rejeita
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

    return NextResponse.json({ user });
  } catch (err) {
    console.error("[api/mobile/me] PATCH error:", err);
    return NextResponse.json({ error: "invalid_token" }, { status: 401 });
  }
}
