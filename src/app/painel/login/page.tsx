import { PainelLoginPageComponent } from "./";

type LoginPageProps = {
  searchParams: Promise<{
    error?: string;
  }>;
};

export default async function PainelLoginPage({
  searchParams,
}: LoginPageProps) {
  const resolvedSearchParams = await searchParams;
  const error = resolvedSearchParams.error;

  return <PainelLoginPageComponent errorType={error} />;
}
