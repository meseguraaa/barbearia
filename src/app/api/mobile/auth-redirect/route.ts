// src/app/api/mobile/auth-redirect/route.ts
import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { signAppJwt } from "@/lib/app-jwt";

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
  if (c === "server_error") return "Erro no servidor.";

  return "Não foi possível autenticar. Tente novamente.";
}

/**
 * Ponte OAuth (NextAuth Web -> Mobile deep link)
 *
 * Mobile abre:
 *   /api/auth/signin/:provider?callbackUrl=/api/mobile/auth-redirect?redirect_uri=...
 *
 * NextAuth redireciona pra cá com cookie setado.
 * Aqui:
 * - Lemos o token do NextAuth (cookie)
 * - Validamos usuário no banco (isActive)
 * - Geramos JWT próprio do app (Bearer)
 * - Voltamos pro app via redirect_uri com ?token=<json>
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const redirectUri = url.searchParams.get("redirect_uri");

  if (!redirectUri) {
    return NextResponse.json(
      { error: "redirect_uri ausente" },
      { status: 400 },
    );
  }

  // ✅ Se NextAuth mandou erro no callback, repassa pro app com mensagem amigável
  const oauthError = url.searchParams.get("error");
  if (oauthError) {
    const message = mapOauthError(oauthError);
    return NextResponse.redirect(
      `${redirectUri}?error=${encodeURIComponent(oauthError)}&message=${encodeURIComponent(
        message,
      )}`,
    );
  }

  try {
    const token = await getToken({
      req: req as any,
      secret: process.env.NEXTAUTH_SECRET,
    });

    if (!token) {
      return NextResponse.redirect(`${redirectUri}?error=not_authenticated`);
    }

    const userId =
      typeof (token as any).id === "string"
        ? ((token as any).id as string)
        : "";

    if (!userId) {
      return NextResponse.redirect(`${redirectUri}?error=missing_user_id`);
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        image: true,
        phone: true,
        isOwner: true,
        isActive: true,
        adminAccess: true,
      },
    });

    if (!dbUser) {
      return NextResponse.redirect(`${redirectUri}?error=user_not_found`);
    }

    if (!dbUser.isActive) {
      return NextResponse.redirect(`${redirectUri}?error=user_inactive`);
    }

    const appToken = await signAppJwt({
      sub: dbUser.id,
      role: dbUser.role,
    });

    const payload = {
      appToken,
      user: {
        id: dbUser.id,
        name: dbUser.name,
        email: dbUser.email,
        role: dbUser.role,
        image: dbUser.image,
        phone: dbUser.phone,
        isOwner: dbUser.isOwner,
        adminAccess: dbUser.adminAccess,
      },
    };

    const encoded = encodeURIComponent(JSON.stringify(payload));

    // ✅ limpo: mantém apenas token= (o app já aceita token)
    return NextResponse.redirect(`${redirectUri}?token=${encoded}`);
  } catch (err) {
    console.error("[mobile auth-redirect] error:", err);
    return NextResponse.redirect(`${redirectUri}?error=server_error`);
  }
}
