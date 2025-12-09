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
  session: {
    strategy: "database",
  },
  providers,
  secret: requiredEnv("NEXTAUTH_SECRET"),
  callbacks: {
    async session({ session, user }) {
      if (!session.user) return session;

      const dbUser = await prisma.user.findUnique({
        where: { id: user.id },
        include: {
          adminAccess: true,
        },
      });

      if (!dbUser) {
        (session.user as any).id = user.id;
        (session.user as any).role = (user as any).role;
        (session.user as any).phone = (user as any).phone ?? null;
        return session;
      }

      const isOwner = !!(dbUser as any).isOwner;

      const access = dbUser.adminAccess;

      (session.user as any).id = dbUser.id;
      (session.user as any).role = dbUser.role;
      (session.user as any).phone = dbUser.phone ?? null;
      (session.user as any).isOwner = isOwner;
      (session.user as any).adminAccess = access ?? null;

      return session;
    },
    async signIn() {
      return true;
    },
  },
};
