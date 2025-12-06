"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

import { CalendarRange, ShoppingBag, UserRound } from "lucide-react";

type ClientLink = {
  href: string;
  label: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
};

const clientLinks: ClientLink[] = [
  {
    href: "/client/schedule",
    label: "Agendar",
    icon: CalendarRange,
  },
  {
    href: "/client/products",
    label: "Produtos",
    icon: ShoppingBag,
  },
  {
    href: "/client/history",
    label: "Histórico",
    icon: UserRound,
  },
];

export function ClientNav() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center">
      {clientLinks.map((link) => {
        const isActive = pathname?.startsWith(link.href);
        const Icon = link.icon;

        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "flex items-center justify-center gap-2 px-4 py-2 text-label-small transition-colors",
              "text-content-secondary hover:bg-background-tertiary/50",
              isActive && "text-content-brand font-medium",
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
