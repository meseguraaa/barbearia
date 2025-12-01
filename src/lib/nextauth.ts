// src/lib/nextauth.ts
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import AppleProvider from "next-auth/providers/apple";
import FacebookProvider from "next-auth/providers/facebook";
import { prisma } from "@/lib/prisma";

// Helper para envs obrigatórias
function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Environment variable ${name} is not set`);
  }
  return value;
}

const providers: NextAuthOptions["providers"] = [
  GoogleProvider({
    clientId: requiredEnv("GOOGLE_CLIENT_ID"),
    clientSecret: requiredEnv("GOOGLE_CLIENT_SECRET"),
  }),
  FacebookProvider({
    clientId: requiredEnv("FACEBOOK_CLIENT_ID"),
    clientSecret: requiredEnv("FACEBOOK_CLIENT_SECRET"),
  }),
];

// Apple OPCIONAL: só adiciona se tiver as envs mínimas
const hasAppleEnv =
  process.env.APPLE_CLIENT_ID && process.env.APPLE_CLIENT_SECRET;

if (hasAppleEnv) {
  providers.push(
    AppleProvider({
      clientId: requiredEnv("APPLE_CLIENT_ID"),
      // Versão simples: clientSecret é uma string (por ex. JWT gerado e guardado em env)
      clientSecret: requiredEnv("APPLE_CLIENT_SECRET"),
    }),
  );
}

export const nextAuthOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),

  session: {
    strategy: "database",
  },

  providers,

  secret: requiredEnv("NEXTAUTH_SECRET"),

  callbacks: {
    async session({ session, user }) {
      if (session.user) {
        // id e role expostos para o front
        (session.user as any).id = user.id;
        (session.user as any).role = (user as any).role;

        // 🔹 novo: expor o telefone também na sessão
        (session.user as any).phone = (user as any).phone ?? null;
      }
      return session;
    },

    async signIn({ user, account }) {
      // Se no futuro quiser bloquear por domínio, etc, fazemos aqui.
      return true;
    },
  },
};
