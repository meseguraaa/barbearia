// src/app/api/mobile/auth-redirect/route.ts
import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { signAppJwt } from "@/lib/app-jwt";

/**
 * Ponte OAuth (NextAuth Web -> Mobile deep link)
 *
 * Mobile abre:
 *   /api/auth/signin/:provider?callbackUrl=/api/mobile/auth-redirect?redirect_uri=...
 *
 * Depois do login, NextAuth redireciona pra cá com o cookie setado.
 * Aqui:
 * - Lemos o token do NextAuth (cookie)
 * - Garantimos o usuário no banco
 * - Geramos um JWT próprio do app (Bearer) pro mobile usar nas APIs
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

  try {
    const token = await getToken({
      req: req as any,
      secret: process.env.NEXTAUTH_SECRET,
    });

    if (!token) {
      return NextResponse.redirect(`${redirectUri}?error=not_authenticated`);
    }

    // Seu nextAuthOptions.jwt() coloca (token as any).id
    const userId =
      typeof (token as any).id === "string"
        ? ((token as any).id as string)
        : "";

    if (!userId) {
      return NextResponse.redirect(`${redirectUri}?error=missing_user_id`);
    }

    // Puxa do banco pra garantir consistência e checar isActive
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

    // ✅ JWT do app (Bearer) pro mobile usar em todas as requests
    const appToken = await signAppJwt({
      sub: dbUser.id,
      role: dbUser.role,
    });

    // ✅ Payload que o teu Login.tsx já espera:
    // const parsed = JSON.parse(decodeURIComponent(token));
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
    return NextResponse.redirect(`${redirectUri}?token=${encoded}`);
  } catch (err) {
    console.error("[mobile auth-redirect] error:", err);
    return NextResponse.redirect(`${redirectUri}?error=server_error`);
  }
}
