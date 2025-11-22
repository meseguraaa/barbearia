"use client";

import { loginPainel } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Github, Chrome } from "lucide-react";

type ErrorType = "credenciais" | "desconhecido" | "permissao" | undefined;

export function PainelLoginPageComponent({
  errorType,
}: {
  errorType?: ErrorType;
}) {
  let errorMessage: string | null = null;

  if (errorType === "credenciais") {
    errorMessage = "E-mail ou senha inválidos.";
  } else if (errorType === "desconhecido") {
    errorMessage = "Ocorreu um erro ao fazer login. Tente novamente.";
  } else if (errorType === "permissao") {
    errorMessage =
      "Você não tem permissão para acessar o painel. Entre com uma conta de barbeiro ou administrador.";
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-lg rounded-2xl bg-background-secondary border border-border-primary shadow-lg px-8 py-10 space-y-8">
        {/* Título */}
        <header className="space-y-2">
          <h1 className="text-title text-content-primary">Acesse sua conta</h1>
          <p className="text-paragraph-medium text-content-secondary">
            Faça login para entrar no painel da barbearia.
          </p>
        </header>

        {/* Erro */}
        {errorMessage && (
          <div className="text-paragraph-small text-destructive bg-destructive/10 border border-destructive/40 rounded-md px-3 py-2">
            {errorMessage}
          </div>
        )}

        {/* Formulário */}
        <form action={loginPainel} className="space-y-5">
          <div className="space-y-2">
            <Label
              htmlFor="email"
              className="text-label-small text-content-secondary"
            >
              E-mail
            </Label>
            <Input
              id="email"
              name="email"
              type="email"
              required
              placeholder="Seu e-mail"
              className="bg-background-tertiary border-border-primary text-content-primary placeholder:text-content-tertiary focus-visible:ring-2 focus-visible:ring-border-brand focus-visible:ring-offset-0"
            />
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="password"
              className="text-label-small text-content-secondary"
            >
              Senha
            </Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              placeholder="Sua senha"
              className="bg-background-tertiary border-border-primary text-content-primary placeholder:text-content-tertiary focus-visible:ring-2 focus-visible:ring-border-brand focus-visible:ring-offset-0"
            />
          </div>

          <Button type="submit" className="w-full " variant="brand">
            Entrar
          </Button>
        </form>
      </div>
    </div>
  );
}
