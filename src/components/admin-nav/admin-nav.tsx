"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Scissors,
  ListChecks,
  Package,
  Wallet,
  Users,
  CalendarCheck, // ← ícone para Agendamentos
} from "lucide-react";

type AdminLink = {
  href: string;
  label: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
};

const adminLinks: AdminLink[] = [
  { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },

  // 🔥 NOVA PÁGINA DE AGENDAMENTOS
  { href: "/admin/appointments", label: "Agendamentos", icon: CalendarCheck },

  { href: "/admin/professional", label: "Profissionais", icon: Scissors },
  { href: "/admin/services", label: "Serviços", icon: ListChecks },
  { href: "/admin/products", label: "Produtos", icon: Package },
  { href: "/admin/clients", label: "Clientes", icon: Users },
  { href: "/admin/finance", label: "Financeiro", icon: Wallet },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-2">
      {adminLinks.map((link) => {
        const isActive = pathname?.startsWith(link.href);
        const Icon = link.icon;

        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "flex items-center justify-center gap-2 px-4 py-2 text-label-small transition-colors",
              "text-content-secondary hover:bg-background-tertiary/50 rounded-lg",
              isActive &&
                "text-content-brand font-medium bg-background-tertiary/50",
            )}
          >
            <Icon
              className={cn(
                "h-4 w-4",
                isActive ? "text-content-brand" : "text-content-secondary",
              )}
            />
            <span>{link.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
