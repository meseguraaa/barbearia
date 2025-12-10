// src/lib/nextauth.ts
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import AppleProvider from "next-auth/providers/apple";
import FacebookProvider from "next-auth/providers/facebook";
import { prisma } from "@/lib/prisma";

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

const hasAppleEnv =
  process.env.APPLE_CLIENT_ID && process.env.APPLE_CLIENT_SECRET;

if (hasAppleEnv) {
  providers.push(
    AppleProvider({
      clientId: requiredEnv("APPLE_CLIENT_ID"),
      clientSecret: requiredEnv("APPLE_CLIENT_SECRET"),
    }),
  );
}

export const nextAuthOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),

  // 👉 usamos JWT em vez de session em banco
  session: {
    strategy: "jwt",
  },

  debug: process.env.NODE_ENV === "development",

  providers,
  secret: requiredEnv("NEXTAUTH_SECRET"),

  callbacks: {
    /**
     * JWT: roda sempre que o token é criado/atualizado.
     * Aqui é onde carregamos os dados do usuário do banco
     * e salvamos dentro do `token`.
     */
    async jwt({ token, user }) {
      // Quando o usuário acabou de logar, `user` vem preenchido
      if (user) {
        const dbUser = await prisma.user.findUnique({
          where: { id: (user as any).id },
          include: {
            adminAccess: true,
          },
        });

        const baseUser = dbUser ?? (user as any);

        (token as any).id = baseUser.id;
        (token as any).role = baseUser.role;
        (token as any).phone = baseUser.phone ?? null;
        (token as any).isOwner = !!baseUser.isOwner;
        (token as any).adminAccess = baseUser.adminAccess ?? null;

        return token;
      }

      // Se já existe token (sessão antiga), garantimos que tem id/role
      if (!(token as any).id && token.email) {
        const dbUser = await prisma.user.findUnique({
          where: { email: token.email as string },
          include: {
            adminAccess: true,
          },
        });

        if (dbUser) {
          (token as any).id = dbUser.id;
          (token as any).role = dbUser.role;
          (token as any).phone = dbUser.phone ?? null;
          (token as any).isOwner = !!dbUser.isOwner;
          (token as any).adminAccess = dbUser.adminAccess ?? null;
        }
      }

      return token;
    },

    /**
     * SESSION: copia os dados do token para `session.user`,
     * que é o que a gente usa lá no `requireAdminWithPermissions`.
     */
    async session({ session, token }) {
      if (!session.user) return session;

      (session.user as any).id = (token as any).id;
      (session.user as any).role = (token as any).role;
      (session.user as any).phone = (token as any).phone ?? null;
      (session.user as any).isOwner = (token as any).isOwner ?? false;
      (session.user as any).adminAccess = (token as any).adminAccess ?? null;

      return session;
    },

    async signIn() {
      // aqui você poderia colocar alguma regra extra
      // (ex: bloquear login de user inativo),
      // por enquanto mantive do jeito que já estava
      return true;
    },
  },
};
