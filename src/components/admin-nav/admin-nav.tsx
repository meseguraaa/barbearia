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
  Tag, // ← Ícone para Motivos de Avaliação
} from "lucide-react";

type AdminLink = {
  href: string;
  label: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
};

const adminLinks: AdminLink[] = [
  { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },

  // 🔥 AGENDAMENTOS
  { href: "/admin/appointments", label: "Agendamentos", icon: CalendarCheck },

  // 🔥 NOVO CHECKOUT
  { href: "/admin/checkout", label: "Checkout", icon: ShoppingCart },

  { href: "/admin/professional", label: "Profissionais", icon: Scissors },
  { href: "/admin/services", label: "Serviços", icon: ListChecks },

  // ⭐ NOVA ENTRADA — MOTIVOS DE AVALIAÇÃO
  {
    href: "/admin/review-tags",
    label: "Avaliação",
    icon: Tag,
  },

  { href: "/admin/products", label: "Produtos", icon: Package },
  { href: "/admin/clients", label: "Clientes", icon: Users },
  { href: "/admin/finance", label: "Financeiro", icon: Wallet },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav
      className={cn(
        "group fixed left-0 top-0 z-40 flex h-screen flex-col border-r border-border-primary bg-background-primary",
        "w-14 hover:w-56 transition-[width] duration-200 ease-in-out",
        "pt-6", // 👉 desce o menu para alinhar com os títulos
      )}
    >
      {/* Espaço para logo / topo se quiser depois */}
      <div className="flex h-14 items-center px-2">
        {/* se quiser colocar logo depois, é aqui */}
      </div>

      <div className="flex-1 space-y-1 px-2 pb-4">
        {adminLinks.map((link) => {
          const isActive = pathname?.startsWith(link.href);
          const Icon = link.icon;

          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                // alinhado horizontal, ocupa largura toda
                "flex items-center gap-2 px-3 py-2 rounded-lg text-label-small transition-colors",
                // cores originais
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
              {/* Label aparece só quando o sidebar está expandido */}
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
      </div>
    </nav>
  );
}
