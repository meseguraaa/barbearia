// app/admin/professional/page.tsx
import { prisma } from "@/lib/prisma";
import type { Metadata } from "next";

import { ProfessionalNewDialog } from "@/components/professional-new-dialog";
import { ProfessionalRow } from "@/components/professional-row";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin | Profissionais",
};

export default async function BarbersPage() {
  const barbers = await prisma.barber.findMany({
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6 max-w-7xl ">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-title text-content-primary">Profissionais</h1>
          <p className="text-paragraph-medium-size text-content-secondary">
            Gerencie os Profissionais disponíveis para agendamento.
          </p>
        </div>

        <ProfessionalNewDialog />
      </header>

      <section className="overflow-x-auto rounded-xl border border-border-primary bg-background-tertiary">
        <table className="min-w-full text-sm">
          <tbody>
            {barbers.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-6 text-center text-paragraph-small text-content-secondary"
                >
                  Nenhum profissional cadastrado ainda.
                </td>
              </tr>
            ) : (
              barbers.map((barber) => (
                <ProfessionalRow key={barber.id} barber={barber} />
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
