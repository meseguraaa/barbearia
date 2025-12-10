// src/components/admin-nav.tsx
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
  CalendarCheck,
  ShoppingCart,
  Tag,
  Settings,
} from "lucide-react";
import type { AdminModule } from "@/lib/admin-permissions";

type AdminLink = {
  href: string;
  label: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  module?: AdminModule; // se tiver módulo, respeita permissão; se não, sempre mostra
};

type AdminNavProps = {
  allowedModules: AdminModule[];
  isOwner?: boolean;
};

const adminLinks: AdminLink[] = [
  {
    href: "/admin/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    module: "DASHBOARD",
  },
  {
    href: "/admin/appointments",
    label: "Agendamentos",
    icon: CalendarCheck,
    module: "APPOINTMENTS",
  },
  {
    href: "/admin/checkout",
    label: "Checkout",
    icon: ShoppingCart,
    module: "CHECKOUT",
  },
  {
    href: "/admin/professional",
    label: "Profissionais",
    icon: Scissors,
    module: "PROFESSIONALS",
  },
  {
    href: "/admin/services",
    label: "Serviços",
    icon: ListChecks,
    module: "SERVICES",
  },
  {
    href: "/admin/review-tags",
    label: "Avaliação",
    icon: Tag,
    // se quiser permissionar depois, coloca um module aqui
  },
  {
    href: "/admin/products",
    label: "Produtos",
    icon: Package,
    // idem
  },
  {
    href: "/admin/clients",
    label: "Clientes",
    icon: Users,
    module: "CLIENTS",
  },
  {
    href: "/admin/finance",
    label: "Financeiro",
    icon: Wallet,
    module: "FINANCE",
  },
];

export function AdminNav({ allowedModules }: AdminNavProps) {
  const pathname = usePathname();

  const filteredLinks = adminLinks.filter((link) => {
    // se o link tem módulo, só mostra se estiver permitido
    if (link.module) {
      return allowedModules.includes(link.module);
    }
    // se não tiver module mapeado, mostra sempre (por enquanto)
    return true;
  });

  return (
    <nav
      className={cn(
        "group fixed left-0 top-0 z-40 flex h-screen flex-col border-r border-border-primary bg-background-primary",
        "w-14 hover:w-56 transition-[width] duration-200 ease-in-out",
        "pt-6",
      )}
    >
      <div className="flex-1 space-y-1 px-2 pb-4 pt-14">
        {filteredLinks.map((link) => {
          const isActive = pathname?.startsWith(link.href);
          const Icon = link.icon;

          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-lg text-label-small transition-colors",
                "text-content-secondary hover:bg-background-tertiary/50",
                isActive &&
                  "text-content-brand font-medium bg-background-tertiary/50",
              )}
            >
              <Icon
                className={cn(
                  "h-4 w-4 shrink-0",
                  isActive ? "text-content-brand" : "text-content-secondary",
                )}
              />
              <span
                className={cn(
                  "whitespace-nowrap",
                  "opacity-0 -translate-x-1",
                  "transition-all duration-200",
                  "group-hover:opacity-100 group-hover:translate-x-0",
                )}
              >
                {link.label}
              </span>
            </Link>
          );
        })}

        {/* Configurações: só mostra se tiver módulo SETTINGS liberado */}
        {allowedModules.includes("SETTINGS") && (
          <Link
            href="/admin/settings"
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-lg text-label-small transition-colors",
              "text-content-secondary hover:bg-background-tertiary/50",
              pathname?.startsWith("/admin/settings") &&
                "text-content-brand font-medium bg-background-tertiary/50",
            )}
          >
            <Settings
              className={cn(
                "h-4 w-4 shrink-0",
                pathname?.startsWith("/admin/settings")
                  ? "text-content-brand"
                  : "text-content-secondary",
              )}
            />
            <span
              className={cn(
                "whitespace-nowrap",
                "opacity-0 -translate-x-1",
                "transition-all duration-200",
                "group-hover:opacity-100 group-hover:translate-x-0",
              )}
            >
              Configurações
            </span>
          </Link>
        )}
      </div>
    </nav>
  );
}
