// src/lib/auth.ts
import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

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
 * Só valida e-mail/senha e retorna o usuário.
 * A permissão de acessar o painel fica no loginPainel.
 */
export async function loginWithCredentials(
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

    // se o seu AuthenticatedUser tiver isso:
    isOwner: user.isOwner,

    // multi-unidade vindo do AdminAccess
    unitId: user.adminAccess?.unitId ?? null,
  };
}
