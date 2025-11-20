import { loginPainel } from "./actions";

export function PainelLoginPageComponent({
  errorType,
}: {
  errorType?: string;
}) {
  let errorMessage: string | null = null;

  if (errorType === "credenciais") {
    errorMessage = "E-mail ou senha inválidos.";
  } else if (errorType === "desconhecido") {
    errorMessage = "Ocorreu um erro ao fazer login. Tente novamente.";
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg p-6 space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-xl font-semibold text-slate-900">
            Login do painel
          </h1>
          <p className="text-sm text-slate-500">
            Acesso para barbeiros e administradores
          </p>
        </div>

        {errorMessage && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2 text-center">
            {errorMessage}
          </div>
        )}

        <form action={loginPainel} className="space-y-4">
          <div className="space-y-1">
            <label
              htmlFor="email"
              className="block text-sm font-medium text-slate-700"
            >
              E-mail
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900"
            />
          </div>

          <div className="space-y-1">
            <label
              htmlFor="password"
              className="block text-sm font-medium text-slate-700"
            >
              Senha
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900"
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-md bg-slate-900 text-white text-sm font-medium py-2.5 hover:bg-slate-800 transition"
          >
            Entrar
          </button>
        </form>
      </div>
    </div>
  );
}
