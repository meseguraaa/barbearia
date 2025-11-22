"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { LayoutDashboard, Scissors } from "lucide-react";

type AdminLink = {
  href: string;
  label: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
};

const adminLinks: AdminLink[] = [
  { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/barber", label: "Barbeiros", icon: Scissors },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center">
      {adminLinks.map((link) => {
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
