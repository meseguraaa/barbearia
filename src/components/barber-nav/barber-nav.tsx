"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { LayoutDashboard, WalletCards } from "lucide-react";

type BarberLink = {
  href: string;
  label: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
};

const barberLinks: BarberLink[] = [
  {
    href: "/barber/dashboard",
    label: "Minha agenda",
    icon: LayoutDashboard,
  },
  {
    href: "/barber/earnings",
    label: "Meus ganhos",
    icon: WalletCards,
  },
];

export function BarberNav() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center">
      {barberLinks.map((link) => {
        const isActive = pathname?.startsWith(link.href);
        const Icon = link.icon;

        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "flex items-center justify-center gap-2 px-4 py-2 text-label-small transition-colors",
              // estado padrão
              "text-content-secondary hover:bg-background-tertiary/50",
              // ativo
              isActive && " text-content-brand font-medium",
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
