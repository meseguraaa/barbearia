import { ReactNode } from "react";
import { logoutPainel } from "@/app/painel/login/actions";

export default function BarberDashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">
              Painel do Barbeiro
            </h1>
            <p className="text-sm text-slate-500">
              Aqui você vê e gerencia os seus agendamentos.
            </p>
          </div>

          <form action={logoutPainel}>
            <button
              type="submit"
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 transition"
            >
              Sair
            </button>
          </form>
        </header>

        <section className="bg-white rounded-2xl shadow p-4">
          {children}
        </section>
      </div>
    </main>
  );
}
