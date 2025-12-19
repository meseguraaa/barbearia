// src/lib/auth.ts
import type { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

export type AuthenticatedUser = {
  id: string;
  name: string | null;
  email: string;
  role: Role;

  // ✅ Multi-unidade
  // - Admin de unidade: unitId definido
  // - Admin dono: isOwner = true e unitId pode ser null
  unitId?: string | null;
  isOwner?: boolean;
};

export class AuthError extends Error {
  constructor(message = "Credenciais inválidas.") {
    super(message);
    this.name = "AuthError";
  }
}

/**
 * Implementação injetável (CORE-FRIENDLY):
 * Você passa um prisma client (ideal pra reuso em services/route-handlers/actions)
 */
export async function loginWithCredentialsWithPrisma(
  prisma: PrismaClient,
  email: string,
  password: string,
): Promise<AuthenticatedUser> {
  const normalizedEmail = email.trim().toLowerCase();

  // ✅ Seleciona apenas o necessário (e traz unitId/isOwner pra sessão do painel)
  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isOwner: true,
      passwordHash: true,

      adminAccess: {
        select: {
          unitId: true, // ✅ aqui existe
        },
      },
    },
  });

  if (!user || !user.passwordHash) {
    throw new AuthError();
  }

  const isValid = await bcrypt.compare(password, user.passwordHash);
  if (!isValid) {
    throw new AuthError();
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,

    isOwner: user.isOwner,
    unitId: user.adminAccess?.unitId ?? null,
  };
}

/**
 * Wrapper compatível (não quebra o projeto agora):
 * mantém a assinatura original e usa o prisma "padrão" do app.
 *
 * No próximo passo, vamos substituir o prisma daqui por "@/lib/prisma"
 * (singleton), pra não abrir conexão demais.
 */
export async function loginWithCredentials(
  email: string,
  password: string,
): Promise<AuthenticatedUser> {
  const { prisma } = await import("@/lib/prisma");
  return loginWithCredentialsWithPrisma(prisma as any, email, password);
}
