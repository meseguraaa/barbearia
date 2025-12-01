"use server";

import { getServerSession } from "next-auth";
import { nextAuthOptions } from "@/lib/nextauth";
import { prisma } from "@/lib/prisma";

export async function getClientProfileAction() {
  const session = await getServerSession(nextAuthOptions);

  if (!session || (session.user as any).role !== "CLIENT") {
    throw new Error("Sem permissão");
  }

  const userId = (session.user as any).id;

  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new Error("Usuário não encontrado");
  }

  return {
    name: user.name ?? "Cliente",
    email: user.email ?? "",
    image: user.image ?? "/default-avatar.png",
    phone: user.phone ?? "",
  };
}

export async function updateClientPhoneAction(phone: string) {
  const session = await getServerSession(nextAuthOptions);

  if (!session || (session.user as any).role !== "CLIENT") {
    throw new Error("Sem permissão");
  }

  const userId = (session.user as any).id;

  await prisma.user.update({
    where: { id: userId },
    data: { phone: phone.trim() },
  });

  return { ok: true };
}
