// app/admin/dashboard/actions.ts
"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function deleteAppointment(formData: FormData) {
  const id = formData.get("id");

  if (typeof id !== "string" || !id) {
    throw new Error("ID do agendamento inválido.");
  }

  await prisma.appointment.delete({
    where: { id },
  });

  // garante que o dashboard seja atualizado
  revalidatePath("/admin/dashboard");
}
