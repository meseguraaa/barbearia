import { ReactNode } from "react";
import { logoutPainel } from "@/app/painel/login/actions";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/date-picker";

export default function BarberDashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <main className="min-h-screen bg-background-primary px-4 md:px-0 py-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <header className="flex items-center justify-between">
          <div className="space-y-1">
            <h1 className="text-title text-content-primary">Minha agenda</h1>
            <p className="text-paragraph-medium-size text-content-secondary">
              Veja os horários agendados para a data selecionada.
            </p>
          </div>
          <DatePicker />
        </header>

        <section>{children}</section>
      </div>
    </main>
  );
}
