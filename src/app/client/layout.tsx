"use client";

import { ReactNode, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

type ClientLayoutProps = {
  children: ReactNode;
};

export default function ClientLayout({ children }: ClientLayoutProps) {
  const router = useRouter();
  const { data: session, status } = useSession();

  useEffect(() => {
    // Enquanto está carregando, não faz nada
    if (status === "loading") return;

    // Não autenticado → manda para login
    if (status === "unauthenticated" || !session?.user) {
      router.replace("/painel/login");
      return;
    }

    const role = (session.user as any).role;

    // Se não for CLIENT, redireciona conforme o papel
    if (role === "ADMIN") {
      router.replace("/admin/dashboard");
    } else if (role === "BARBER") {
      router.replace("/painel");
    } else if (role !== "CLIENT") {
      // fallback genérico se vier algo estranho
      router.replace("/");
    }
  }, [status, session, router]);

  // Enquanto:
  // - estiver carregando
  // - OU estiver redirecionando por não ser CLIENT
  // não mostra nada (evita flicker)
  if (status === "loading") {
    return null;
  }

  const role = (session?.user as any)?.role;

  if (!session?.user || role !== "CLIENT") {
    return null;
  }

  // Se chegou aqui: está autenticado e é CLIENT ✅
  return <>{children}</>;
}
