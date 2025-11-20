// src/lib/auth.ts
import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

export type AuthenticatedUser = {
  id: string;
  name: string | null;
  email: string;
  role: Role;
};

export class AuthError extends Error {
  constructor(message = "Credenciais inválidas.") {
    super(message);
    this.name = "AuthError";
  }
}

export async function loginWithCredentials(
  email: string,
  password: string,
): Promise<AuthenticatedUser> {
  const normalizedEmail = email.trim().toLowerCase();

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (!user || !user.passwordHash) {
    throw new AuthError();
  }

  // Apenas BARBER e ADMIN podem usar esse login
  if (user.role !== "BARBER" && user.role !== "ADMIN") {
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
  };
}
