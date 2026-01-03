// src/app/api/mobile/auth-redirect/route.ts
import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { signAppJwt } from "@/lib/app-jwt";

type AppRole = "CLIENT" | "BARBER" | "ADMIN";
type MemberRole = "OWNER" | "ADMIN" | "STAFF" | "CLIENT";

function mapMemberRoleToAppRole(role: MemberRole): AppRole {
  if (role === "OWNER") return "ADMIN";
  if (role === "ADMIN") return "ADMIN";
  if (role === "STAFF") return "BARBER";
  return "CLIENT";
}

function mapOauthError(code: string) {
  const c = String(code || "").trim();

  if (c === "OAuthAccountNotLinked") {
    return "Essa conta já existe com outro método de login. Use o método anterior ou peça para vincular o Google.";
  }
  if (c === "AccessDenied") return "Acesso negado. Tente novamente.";
  if (c === "Configuration") return "Configuração de login inválida.";

  if (c === "user_inactive") return "Usuário inativo.";
  if (c === "user_not_found") return "Usuário não encontrado.";
  if (c === "not_authenticated") return "Não autenticado.";
  if (c === "missing_user_id") return "Falha ao identificar usuário.";
  if (c === "missing_company_id") return "Falha ao identificar empresa.";
  if (c === "company_not_allowed")
    return "Você não tem acesso a esta empresa neste app.";
  if (c === "company_inactive") return "Empresa inativa.";
  if (c === "server_error") return "Erro no servidor.";

  return "Não foi possível autenticar. Tente novamente.";
}

function computeProfileComplete(u: {
  phone: string | null;
  birthday: Date | null;
}) {
  const phoneOk = typeof u.phone === "string" && u.phone.trim().length > 0;
  const birthdayOk =
    u.birthday instanceof Date && !Number.isNaN(u.birthday.getTime());
  return phoneOk && birthdayOk;
}

function readCompanyId(url: URL): string {
  const raw =
    url.searchParams.get("companyId") ??
    url.searchParams.get("company_id") ??
    "";
  return String(raw).trim();
}

/** Monta URL final anexando params sem quebrar ?/& */
function withParams(baseUrl: string, params: Record<string, string>) {
  const sep = baseUrl.includes("?") ? "&" : "?";
  const qs = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  return `${baseUrl}${sep}${qs}`;
}

/** Redirect 302 + no-store (mobile deep link friendly) */
function redirect302(target: string) {
  const res = NextResponse.redirect(target, { status: 302 });
  res.headers.set(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate",
  );
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  return res;
}

/**
 * Ponte OAuth (NextAuth Web -> Mobile deep link)
 */
export async function GET(req: Request) {
  const url = new URL(req.url);

  const redirectUriRaw = url.searchParams.get("redirect_uri");
  if (!redirectUriRaw) {
    return NextResponse.json(
      { error: "redirect_uri ausente" },
      { status: 400 },
    );
  }

  // IMPORTANT: no seu fluxo ele vem url-encoded (exp%3A%2F%2F...)
  const redirectUri = decodeURIComponent(redirectUriRaw);

  const oauthError = url.searchParams.get("error");
  if (oauthError) {
    const message = mapOauthError(oauthError);
    return redirect302(
      withParams(redirectUri, {
        error: String(oauthError),
        message,
      }),
    );
  }

  try {
    const token = await getToken({
      req: req as any,
      secret: process.env.NEXTAUTH_SECRET,
    });

    if (!token) {
      return redirect302(
        withParams(redirectUri, { error: "not_authenticated" }),
      );
    }

    const userId =
      typeof (token as any).id === "string"
        ? String((token as any).id).trim()
        : typeof (token as any).sub === "string"
          ? String((token as any).sub).trim()
          : "";

    if (!userId) {
      return redirect302(withParams(redirectUri, { error: "missing_user_id" }));
    }

    // companyId fixo do app (preferência total)
    const requestedCompanyId = readCompanyId(url);

    // fallback compat (não ideal, mas ok)
    const tokenCompanyId =
      typeof (token as any).companyId === "string"
        ? String((token as any).companyId).trim()
        : "";

    const companyId = requestedCompanyId || tokenCompanyId;

    if (!companyId) {
      return redirect302(
        withParams(redirectUri, { error: "missing_company_id" }),
      );
    }

    // ✅ valida se a empresa existe e está ativa (evita token pra tenant desligado)
    const company = await prisma.company.findFirst({
      where: { id: companyId, isActive: true },
      select: { id: true },
    });

    if (!company) {
      return redirect302(
        withParams(redirectUri, { error: "company_inactive" }),
      );
    }

    // ✅ valida user (existência + isActive + dados necessários)
    const dbUser = await prisma.user.findFirst({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        phone: true,
        birthday: true,
        isOwner: true,
        isActive: true,
        role: true, // compat (não é fonte principal)
      },
    });

    if (!dbUser) {
      return redirect302(withParams(redirectUri, { error: "user_not_found" }));
    }

    if (!dbUser.isActive) {
      return redirect302(withParams(redirectUri, { error: "user_inactive" }));
    }

    // ✅ valida membership ativo nessa company
    const membership = await prisma.companyMember.findFirst({
      where: {
        userId: dbUser.id,
        companyId,
        isActive: true,
      },
      select: {
        role: true,
        companyId: true,
        lastUnitId: true,
      },
    });

    if (!membership) {
      return redirect302(
        withParams(redirectUri, { error: "company_not_allowed" }),
      );
    }

    const profileComplete = computeProfileComplete({
      phone: dbUser.phone ?? null,
      birthday: dbUser.birthday ?? null,
    });

    const derivedRole = mapMemberRoleToAppRole(membership.role as MemberRole);

    const appToken = await signAppJwt({
      sub: dbUser.id,
      role: derivedRole,
      companyId: membership.companyId,
      profile_complete: profileComplete,
    });

    // ⚠️ Nota: JSON no query pode ficar grande. Mantive seu formato,
    // mas se começar a estourar URL, trocamos por só appToken + campos mínimos.
    const payload = {
      appToken,
      user: {
        id: dbUser.id,
        companyId: membership.companyId,
        name: dbUser.name,
        email: dbUser.email,
        role: derivedRole,
        image: dbUser.image,
        phone: dbUser.phone,
        isOwner: dbUser.isOwner,
        profileComplete,
        lastUnitId: membership.lastUnitId,
      },
    };

    const encoded = encodeURIComponent(JSON.stringify(payload));

    // ✅ 302 (não 307) pro mobile abrir o deep link corretamente
    return redirect302(withParams(redirectUri, { token: encoded }));
  } catch (err) {
    console.error("[mobile auth-redirect] error:", err);
    return redirect302(withParams(redirectUri, { error: "server_error" }));
  }
}
