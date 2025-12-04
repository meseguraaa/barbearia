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

  let birthday = "";

  if (user.birthday) {
    const d = user.birthday;
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    birthday = `${year}-${month}-${day}`; // para salvar como ISO "YYYY-MM-DD"
  }

  return {
    name: user.name ?? "Cliente",
    email: user.email ?? "",
    image: user.image ?? "/default-avatar.png",
    phone: user.phone ?? "",
    birthday,
  };
}

export async function updateClientPhoneAction(input: {
  phone: string;
  birthday?: string | null;
}) {
  const session = await getServerSession(nextAuthOptions);

  if (!session || (session.user as any).role !== "CLIENT") {
    throw new Error("Sem permissão");
  }

  const userId = (session.user as any).id;

  const phone = input.phone?.trim() ?? "";

  let birthdayDate: Date | null = null;

  if (input.birthday) {
    const raw = input.birthday.trim();
    if (raw.length > 0) {
      const [yearStr, monthStr, dayStr] = raw.split("-");
      const year = Number(yearStr);
      const month = Number(monthStr);
      const day = Number(dayStr);

      if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
        birthdayDate = new Date(Date.UTC(year, month - 1, day));
      }
    }
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      phone,
      birthday: birthdayDate,
    },
  });

  return { ok: true };
}
