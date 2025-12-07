// lib/require-complete-client-profile.ts
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

export async function requireCompleteClientProfile(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      phone: true,
      birthday: true,
    },
  });

  if (!user) {
    redirect("/login");
  }

  // 🔒 Regra só para CLIENT
  if (user.role !== "CLIENT") {
    return user;
  }

  const isMissingPhone = !user.phone || user.phone.trim() === "";
  const isMissingBirthday = !user.birthday;

  if (isMissingPhone || isMissingBirthday) {
    // primeira vez / perfil incompleto → manda pra tela de Meu Perfil
    redirect("/client/profile?first=1");
  }

  return user;
}
