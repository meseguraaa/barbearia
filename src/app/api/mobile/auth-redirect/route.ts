import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const redirectUri = url.searchParams.get("redirect_uri");

  if (!redirectUri) {
    return NextResponse.json(
      { error: "redirect_uri ausente" },
      { status: 400 },
    );
  }

  const token = await getToken({
    req: req as any,
    secret: process.env.NEXTAUTH_SECRET,
  });

  if (!token) {
    // se não autenticou, volta pro app com erro (opcional)
    return NextResponse.redirect(`${redirectUri}?error=not_authenticated`);
  }

  // você escolhe o payload: aqui mando o token do NextAuth (JWT)
  const encoded = encodeURIComponent(JSON.stringify(token));
  return NextResponse.redirect(`${redirectUri}?token=${encoded}`);
}
