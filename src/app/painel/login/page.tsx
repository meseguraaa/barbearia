import { PainelLoginPageComponent } from "./";

type ErrorType = "credenciais" | "desconhecido" | "permissao" | undefined;

type LoginPageProps = {
  searchParams: Promise<{
    error?: ErrorType;
  }>;
};

export default async function PainelLoginPage({
  searchParams,
}: LoginPageProps) {
  const resolvedSearchParams = await searchParams;
  const error = resolvedSearchParams.error as ErrorType;

  return <PainelLoginPageComponent errorType={error} />;
}
