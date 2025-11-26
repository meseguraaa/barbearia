"use client";

import { loginPainel } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Chrome } from "lucide-react";
import { signIn } from "next-auth/react";

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
        </header>

        {/* Erro */}
        {errorMessage && (
          <div className="text-paragraph-small text-destructive bg-destructive/10 border border-destructive/40 rounded-md px-3 py-2">
            {errorMessage}
          </div>
        )}

        {/* Formulário – login do painel (ADMIN / BARBER) */}
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

          <Button type="submit" className="w-full" variant="brand">
            Entrar
          </Button>
        </form>

        {/* Separador */}
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-border-primary" />
          <span className="text-paragraph-small text-content-tertiary">ou</span>
          <div className="h-px flex-1 bg-border-primary" />
        </div>

        {/* Login social (Google + Apple lado a lado) */}
        <div className="grid grid-cols-2 gap-3">
          {/* GOOGLE */}
          <Button
            type="button"
            variant="outline"
            className="
      w-full flex items-center justify-center gap-2
      bg-white text-black border border-border-primary
      hover:bg-zinc-100
      h-11 rounded-lg shadow-sm
    "
            onClick={() =>
              signIn("google", {
                callbackUrl: "/",
              })
            }
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 48 48"
              className="w-5 h-5"
            >
              <path
                fill="#FFC107"
                d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8-6.9 0-12.5-5.6-12.5-12.5S17.1 11 24 11c3.2 0 6.2 1.2 8.5 3.3l5.7-5.7C34.6 5.5 29.6 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21c10.5 0 20-7.6 20-21 0-1.3-.1-2.5-.4-3.5z"
              />
              <path
                fill="#FF3D00"
                d="M6.3 14.7l6.6 4.8C14.6 14 18.9 11 24 11c3.2 0 6.2 1.2 8.5 3.3l5.7-5.7C34.6 5.5 29.6 3 24 3 16.3 3 9.5 7.2 6.3 14.7z"
              />
              <path
                fill="#4CAF50"
                d="M24 45c5.3 0 10.2-2 13.9-5.3l-6.4-5.5C29.5 36.6 26.9 38 24 38c-5.3 0-9.7-3.4-11.3-8l-6.6 5C9.4 40.8 16.1 45 24 45z"
              />
              <path
                fill="#1976D2"
                d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.4 5.7l-.1.1 6.4 5.5C36.8 42.9 43 38.2 43 27c0-1.3-.1-2.5-.4-3.5z"
              />
            </svg>
            Google
          </Button>

          {/* APPLE */}
          <Button
            type="button"
            variant="outline"
            className="
      w-full flex items-center justify-center gap-2
      bg-white text-black border border-border-primary
      hover:bg-zinc-100
      h-11 rounded-lg shadow-sm
    "
            onClick={() =>
              signIn("apple", {
                callbackUrl: "/",
              })
            }
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 384 512"
              className="w-5 h-5 fill-black"
            >
              <path d="M318.7 268.7c-.3-36.7 16.4-64.4 50-84.7-18.8-26.9-47.2-41.8-83.2-44.5-34.8-2.5-73.3 20.4-87.3 20.4-15.1 0-50-19.4-77.4-19-57.5.9-119.1 44.2-119.1 132.4 0 29.1 5.4 59.3 16.2 90.7 14.4 40.2 66.2 138.3 120.3 136.4 28.3-.7 48-19.6 84.7-19.6 36.3 0 54.6 19.6 77.4 19.1 54.5-.9 102.9-89.7 117.2-129.9-74.6-28.2-71.3-110-50.8-141.3zM256 96c27.5-32.4 25.1-61.9 24.5-72.1-24.1 1.4-52.4 16.3-68.6 34.7-17.8 20.2-30.6 47.5-26.7 75.4 27.1 2.1 52.8-12.6 70.8-38z" />
            </svg>
            Apple Id
          </Button>
        </div>
      </div>
    </div>
  );
}
