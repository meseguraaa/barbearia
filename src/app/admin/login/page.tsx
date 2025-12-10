// src/app/admin/login/page.tsx
import type { Metadata } from "next";
import { AdminLoginForm } from "./admin-login-form";

export const metadata: Metadata = {
  title: "Admin | Login",
};

type AdminLoginPageProps = {
  searchParams?: Promise<{
    error?: string;
  }>;
};

export default async function AdminLoginPage({
  searchParams,
}: AdminLoginPageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const errorCode = resolvedSearchParams.error;

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-lg rounded-2xl bg-background-secondary border border-border-primary shadow-lg px-8 py-10 space-y-8">
        {/* Título */}
        <header className="space-y-2">
          <h1 className="text-title text-content-primary">Acesso do admin</h1>
        </header>

        <AdminLoginForm initialErrorCode={errorCode} />
      </div>
    </div>
  );
}
