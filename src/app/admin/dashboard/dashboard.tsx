import { logoutPainel } from "@/app/painel/login/actions";

export function AdminDashboardComponent() {
  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-title text-content-primary">
            Painel do Administrador
          </h1>
          <p className="text-paragraph-small text-content-secondary">
            Aqui você vai gerenciar barbeiros e agendamentos.
          </p>
        </div>

        <form action={logoutPainel}>
          <button
            type="submit"
            className="rounded-lg border border-border-primary bg-background-tertiary px-4 py-1.5 text-label-small text-content-secondary hover:bg-background-highlights/10 hover:border-border-brand transition-colors"
          >
            Sair
          </button>
        </form>
      </header>

      <section className="bg-background-tertiary rounded-2xl border border-border-primary px-4 py-4">
        <p className="text-paragraph-small text-content-secondary">
          (Placeholder) Em breve vamos listar aqui:
        </p>
        <ul className="mt-2 list-disc list-inside text-paragraph-small text-content-secondary space-y-1">
          <li>Todos os barbeiros e seus agendamentos</li>
          <li>Ações para editar/cancelar qualquer agendamento</li>
          <li>Gestão de usuários (promover barbeiro para admin)</li>
        </ul>
      </section>
    </div>
  );
}
