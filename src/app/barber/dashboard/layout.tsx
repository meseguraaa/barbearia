import { ReactNode } from "react";
import { logoutPainel } from "@/app/painel/login/actions";
import { Button } from "@/components/ui/button";

export default function BarberDashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <main className="min-h-screen bg-background-primary px-4 py-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <header className="flex items-center justify-between">
          <div className="space-y-1">
            <h1 className="text-title text-content-primary">
              Painel do Barbeiro
            </h1>
            <p className="text-paragraph-small text-content-secondary">
              Aqui você vê e gerencia os seus agendamentos.
            </p>
          </div>

          <form action={logoutPainel}>
            <Button type="submit" variant="outline">
              Sair
            </Button>
          </form>
        </header>

        <section className="rounded-2xl border border-border-primary bg-background-secondary shadow-lg px-6 py-5">
          {children}
        </section>
      </div>
    </main>
  );
}
