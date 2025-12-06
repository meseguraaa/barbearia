"use client";

import { ReactNode, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

import { ClientNav } from "@/components/client-nav";

type ClientLayoutProps = {
  children: ReactNode;
};

export default function ClientLayout({ children }: ClientLayoutProps) {
  const router = useRouter();
  const { data: session, status } = useSession();

  useEffect(() => {
    if (status === "loading") return;

    if (status === "unauthenticated" || !session?.user) {
      router.replace("/painel/login");
      return;
    }

    const role = (session.user as any).role;

    if (role === "ADMIN") {
      router.replace("/admin/dashboard");
    } else if (role === "BARBER") {
      router.replace("/painel");
    } else if (role !== "CLIENT") {
      router.replace("/");
    }
  }, [status, session, router]);

  if (status === "loading") return null;

  const role = (session?.user as any)?.role;

  if (!session?.user || role !== "CLIENT") return null;

  return (
    <div className="min-h-screen bg-background-primary text-content-primary flex flex-col">
      {/* HEADER */}
      <header className="">
        <div className="max-w-5xl mx-auto flex h-16 items-center justify-between">
          <ClientNav />
        </div>
      </header>

      {/* CONTEÚDO */}
      <main className="flex-1">
        <div className="max-w-7xl mx-auto">
          <section className="px-6">{children}</section>
        </div>
      </main>
    </div>
  );
}
