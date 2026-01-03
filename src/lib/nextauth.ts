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

function getPainelCompanyIdFromEnv(): string | null {
  const raw = process.env.PAINEL_COMPANY_ID;
  const companyId = raw?.trim();
  return companyId && companyId.length > 0 ? companyId : null;
}

const providers: NextAuthOptions["providers"] = [
  GoogleProvider({
    clientId: requiredEnv("GOOGLE_CLIENT_ID"),
    clientSecret: requiredEnv("GOOGLE_CLIENT_SECRET"),
    /**
     * ✅ Resolve "Try signing in with a different account." (OAuthAccountNotLinked)
     * Permite vincular conta por email quando já existe usuário no banco.
     * Use com cuidado: assume que o provedor (Google/Facebook) validou o email.
     */
    allowDangerousEmailAccountLinking: true,
  }),
  FacebookProvider({
    clientId: requiredEnv("FACEBOOK_CLIENT_ID"),
    clientSecret: requiredEnv("FACEBOOK_CLIENT_SECRET"),
    allowDangerousEmailAccountLinking: true,
  }),
];

const hasAppleEnv =
  process.env.APPLE_CLIENT_ID && process.env.APPLE_CLIENT_SECRET;

if (hasAppleEnv) {
  providers.push(
    AppleProvider({
      clientId: requiredEnv("APPLE_CLIENT_ID"),
      clientSecret: requiredEnv("APPLE_CLIENT_SECRET"),
      allowDangerousEmailAccountLinking: true,
    }),
  );
}

// Helpers: escolhe "empresa ativa" e o access correto
function pickActiveCompanyId(input: {
  companyMemberships?: Array<{ companyId: string }>;
  adminAccesses?: Array<{ companyId: string }>;
}): string | null {
  return (
    input.companyMemberships?.[0]?.companyId ??
    input.adminAccesses?.[0]?.companyId ??
    null
  );
}

function pickAdminAccessForCompany(
  adminAccesses:
    | Array<{ companyId: string; unitId: string | null }>
    | undefined,
  companyId: string | null,
): { companyId: string; unitId: string | null } | null {
  if (!companyId) return null;
  const found = adminAccesses?.find((a) => a.companyId === companyId) ?? null;
  return found ? { companyId: found.companyId, unitId: found.unitId } : null;
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
      const painelCompanyId = getPainelCompanyIdFromEnv();

      // Quando o usuário acabou de logar, `user` vem preenchido
      if (user) {
        const dbUser = await prisma.user.findUnique({
          where: { id: (user as any).id },
          include: {
            adminAccesses: true,
            companyMemberships: true,
          },
        });

        const baseUser = dbUser ?? (user as any);

        // ✅ multi-tenant do painel: ENV manda quando existe
        const pickedCompanyId = pickActiveCompanyId({
          companyMemberships: baseUser.companyMemberships,
          adminAccesses: baseUser.adminAccesses,
        });

        const companyId = painelCompanyId ?? pickedCompanyId;

        // Se o painel está single-tenant, só aceitamos companyId que exista na lista do usuário
        if (painelCompanyId) {
          const hasMembership = !!baseUser.companyMemberships?.some(
            (m: any) => String(m.companyId) === painelCompanyId,
          );
          const hasAccess = !!baseUser.adminAccesses?.some(
            (a: any) => String(a.companyId) === painelCompanyId,
          );

          if (!hasMembership && !hasAccess) {
            // deixa o login continuar (NextAuth), mas a área admin vai barrar.
            // Ainda assim, registramos companyId como null para não vazar tenant.
            (token as any).companyId = null;
          } else {
            (token as any).companyId = painelCompanyId;
          }
        } else {
          (token as any).companyId = companyId;
        }

        const adminAccess = pickAdminAccessForCompany(
          baseUser.adminAccesses,
          (token as any).companyId ?? null,
        );

        (token as any).id = baseUser.id;
        (token as any).role = baseUser.role;
        (token as any).phone = baseUser.phone ?? null;
        (token as any).isOwner = !!baseUser.isOwner;

        // ✅ compat: mantém "adminAccess" (derivado) porque várias telas usam
        (token as any).adminAccess = adminAccess;

        // ✅ também mantém a lista completa, se você quiser usar depois
        (token as any).adminAccesses = baseUser.adminAccesses ?? [];
        (token as any).companyMemberships = baseUser.companyMemberships ?? [];

        return token;
      }

      // Se já existe token (sessão antiga), garantimos que tem id/role
      if (!(token as any).id && token.email) {
        const dbUser = await prisma.user.findUnique({
          where: { email: token.email as string },
          include: {
            adminAccesses: true,
            companyMemberships: true,
          },
        });

        if (dbUser) {
          const pickedCompanyId = pickActiveCompanyId({
            companyMemberships: dbUser.companyMemberships,
            adminAccesses: dbUser.adminAccesses,
          });

          const companyId = painelCompanyId ?? pickedCompanyId;

          if (painelCompanyId) {
            const hasMembership = !!dbUser.companyMemberships?.some(
              (m: any) => String(m.companyId) === painelCompanyId,
            );
            const hasAccess = !!dbUser.adminAccesses?.some(
              (a: any) => String(a.companyId) === painelCompanyId,
            );

            (token as any).companyId =
              hasMembership || hasAccess ? painelCompanyId : null;
          } else {
            (token as any).companyId = companyId;
          }

          const adminAccess = pickAdminAccessForCompany(
            dbUser.adminAccesses,
            (token as any).companyId ?? null,
          );

          (token as any).id = dbUser.id;
          (token as any).role = dbUser.role;
          (token as any).phone = dbUser.phone ?? null;
          (token as any).isOwner = !!dbUser.isOwner;

          (token as any).adminAccess = adminAccess;
          (token as any).adminAccesses = dbUser.adminAccesses ?? [];
          (token as any).companyMemberships = dbUser.companyMemberships ?? [];
        }
      }

      return token;
    },

    /**
     * SESSION: copia os dados do token para `session.user`.
     */
    async session({ session, token }) {
      if (!session.user) return session;

      (session.user as any).id = (token as any).id;
      (session.user as any).role = (token as any).role;
      (session.user as any).phone = (token as any).phone ?? null;
      (session.user as any).isOwner = (token as any).isOwner ?? false;

      // ✅ multi-empresa
      (session.user as any).companyId = (token as any).companyId ?? null;

      // ✅ compat (derivado)
      (session.user as any).adminAccess = (token as any).adminAccess ?? null;

      // ✅ opcional: deixa disponível para telas novas
      (session.user as any).adminAccesses = (token as any).adminAccesses ?? [];
      (session.user as any).companyMemberships =
        (token as any).companyMemberships ?? [];

      return session;
    },

    /**
     * ✅ Regrinha extra: bloqueia usuário inativo já no login do NextAuth
     */
    async signIn({ user }) {
      try {
        const id = (user as any)?.id as string | undefined;
        const email = (user as any)?.email as string | undefined;

        if (!id && !email) return false;

        const dbUser = id
          ? await prisma.user.findUnique({
              where: { id },
              select: { isActive: true },
            })
          : await prisma.user.findUnique({
              where: { email: email as string },
              select: { isActive: true },
            });

        if (!dbUser) return true; // deixa seguir, o adapter pode criar
        if (dbUser.isActive === false) return false;

        return true;
      } catch {
        // em caso de erro inesperado, não travar login
        return true;
      }
    },
  },
};
