import { NextRequest, NextResponse } from "next/server";
import { loginWithCredentials, AuthError } from "@/lib/auth";
import { createSessionToken } from "@/lib/painel-session";

function withCors(res: NextResponse) {
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization",
  );
  return res;
}

export function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

export async function POST(req: NextRequest) {
  let body: unknown;

  try {
    body = await req.json();
  } catch {
    return withCors(
      NextResponse.json(
        { error: "invalid_body", message: "JSON inválido." },
        { status: 400 },
      ),
    );
  }

  const { email, password } = (body || {}) as {
    email?: string;
    password?: string;
  };

  if (!email || !password) {
    return withCors(
      NextResponse.json(
        {
          error: "missing_credentials",
          message: "E-mail e senha são obrigatórios.",
        },
        { status: 400 },
      ),
    );
  }

  try {
    const user = await loginWithCredentials(email, password);
    const token = await createSessionToken(user);

    return withCors(
      NextResponse.json({
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
      }),
    );
  } catch (err) {
    if (err instanceof AuthError) {
      return withCors(
        NextResponse.json(
          {
            error: "invalid_credentials",
            message: "E-mail ou senha inválidos.",
          },
          { status: 401 },
        ),
      );
    }

    console.error("Erro no login mobile:", err);
    return withCors(
      NextResponse.json(
        { error: "unknown_error", message: "Erro inesperado no login." },
        { status: 500 },
      ),
    );
  }
}
