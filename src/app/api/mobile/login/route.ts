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
    /**
     * 🔐 Login centralizado
     * - loginWithCredentials já valida:
     *   - usuário existe
     *   - senha correta
     *   - isActive
     *   - role permitida
     * - e RETORNA o usuário COM companyId
     */
    const user = await loginWithCredentials(email, password);

    // ✅ Blindagem multi-tenant: painel NÃO funciona sem companyId
    const companyId =
      typeof (user as any)?.companyId === "string"
        ? String((user as any).companyId).trim()
        : "";

    if (!companyId) {
      return withCors(
        NextResponse.json(
          {
            error: "missing_company_context",
            message:
              "Usuário não está vinculado a nenhuma empresa. Contate o administrador.",
          },
          { status: 403 },
        ),
      );
    }

    /**
     * 🧾 Sessão do painel
     * O token DEVE carregar companyId
     */
    const token = await createSessionToken({
      ...user,
      companyId,
    });

    return withCors(
      NextResponse.json({
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          companyId, // ✅ útil para UI, mas o server é a autoridade
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
