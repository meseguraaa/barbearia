// src/components/admin-nav.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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
  Building2,
} from "lucide-react";
import type { AdminModule } from "@/lib/admin-permissions";

type AdminLink = {
  href: string;
  label: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  module?: AdminModule; // se tiver módulo, respeita permissão; se não, sempre mostra
};

type UnitOption = {
  id: string;
  name: string;
};

type AdminNavProps = {
  allowedModules: AdminModule[];

  // ✅ Multi-unidade
  unitId?: string | null;
  canSeeAllUnits?: boolean;

  // ✅ Lista de unidades (vamos passar pelo layout server depois)
  units?: UnitOption[];
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

const UNIT_COOKIE_NAME = "admin_unit_context";
const UNIT_ALL_VALUE = "all";

function setClientCookie(
  name: string,
  value: string,
  maxAgeSeconds = 60 * 60 * 24 * 30,
) {
  // cookie normal (não httpOnly) só pra contexto de UI/queries
  // path=/ pra valer no admin inteiro
  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax`;
}

function getClientCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const cookies = document.cookie.split(";").map((c) => c.trim());
  for (const c of cookies) {
    if (!c) continue;
    const idx = c.indexOf("=");
    if (idx === -1) continue;
    const k = decodeURIComponent(c.slice(0, idx));
    if (k === name) return decodeURIComponent(c.slice(idx + 1));
  }
  return null;
}

export function AdminNav({
  allowedModules,
  unitId = null,
  canSeeAllUnits = false,
  units,
}: AdminNavProps) {
  const pathname = usePathname();
  const router = useRouter();

  // Mantém 100% a lógica de módulos
  const filteredLinks = useMemo(() => {
    return adminLinks.filter((link) => {
      if (link.module) return allowedModules.includes(link.module);
      return true;
    });
  }, [allowedModules]);

  // Unidade selecionada (client-side)
  const [selectedUnit, setSelectedUnit] = useState<string>(() => {
    const fromCookie =
      typeof window !== "undefined" ? getClientCookie(UNIT_COOKIE_NAME) : null;

    if (canSeeAllUnits) {
      // dono: aceita "all" ou uma unidade válida (se units já vierem)
      const allowedIds = new Set((units ?? []).map((u) => u.id));
      if (!fromCookie) return UNIT_ALL_VALUE;

      if (fromCookie === UNIT_ALL_VALUE) return UNIT_ALL_VALUE;
      if (allowedIds.size > 0 && !allowedIds.has(fromCookie))
        return UNIT_ALL_VALUE;

      // se units ainda não carregou (allowedIds.size === 0), deixa passar por enquanto
      return fromCookie;
    }

    // admin de unidade: sempre travado na unitId
    return unitId ?? "";
  });

  // Regra forte:
  // - admin de unidade: força cookie = unitId e travado (não mostra seletor)
  // - dono: se não tiver cookie ainda, seta "all"
  useEffect(() => {
    if (!canSeeAllUnits) {
      if (unitId) {
        if (selectedUnit !== unitId) setSelectedUnit(unitId);
        setClientCookie(UNIT_COOKIE_NAME, unitId);
      }
      return;
    }

    // dono
    // dono
    const cookie = getClientCookie(UNIT_COOKIE_NAME);
    const allowedIds = new Set((units ?? []).map((u) => u.id));

    if (!cookie) {
      setClientCookie(UNIT_COOKIE_NAME, UNIT_ALL_VALUE);
      setSelectedUnit(UNIT_ALL_VALUE);
      return;
    }

    // se units já existe e cookie não é válido, corrige
    if (
      allowedIds.size > 0 &&
      cookie !== UNIT_ALL_VALUE &&
      !allowedIds.has(cookie)
    ) {
      setClientCookie(UNIT_COOKIE_NAME, UNIT_ALL_VALUE);
      setSelectedUnit(UNIT_ALL_VALUE);
      return;
    }
  }, [canSeeAllUnits, unitId, selectedUnit, units]);

  function handleChangeUnit(next: string) {
    // admin de unidade nunca troca unidade
    if (!canSeeAllUnits) return;

    // dono: só aceita "all" OU uma unidade da lista recebida do server
    const allowedIds = new Set((units ?? []).map((u) => u.id));
    const safeNext =
      next === UNIT_ALL_VALUE || allowedIds.has(next) ? next : UNIT_ALL_VALUE;

    setSelectedUnit(safeNext);
    setClientCookie(UNIT_COOKIE_NAME, safeNext);
    router.refresh();
  }

  const shouldShowUnitSelector =
    canSeeAllUnits && Array.isArray(units) && units.length > 0;

  return (
    <nav
      className={cn(
        "group fixed left-0 top-0 z-40 flex h-screen flex-col",
        "border-r border-border-primary bg-background-primary",
        "w-14 hover:w-55 transition-[width] duration-200 ease-in-out",
        "pt-20",
        "overflow-hidden", // ✅ evita qualquer reflow/overflow visual
      )}
    >
      {/* ✅ Header com altura fixa (não empurra os links quando abre) */}
      <div className="px-2">
        <div
          className={cn(
            "flex items-center gap-2 px-3 rounded-lg",
            "text-content-secondary",
            "bg-transparent",
            "h-11", // ✅ altura fixa do header (ajuste se quiser)
          )}
        >
          <Building2 className="h-4 w-4 shrink-0 text-content-secondary" />

          {/* ✅ área do texto sempre reservada, mas só aparece no hover */}
          <div className="min-w-0 flex-1 overflow-hidden">
            <div
              className={cn(
                "opacity-0 -translate-x-1 pointer-events-none",
                "transition-all duration-200",
                "group-hover:opacity-100 group-hover:translate-x-0 group-hover:pointer-events-auto",
              )}
            >
              {shouldShowUnitSelector ? (
                <select
                  value={selectedUnit}
                  onChange={(e) => handleChangeUnit(e.target.value)}
                  className={cn(
                    "w-full h-9 rounded-md px-2",
                    "bg-background-tertiary border border-border-primary",
                    "text-content-primary text-sm",
                    "focus:outline-none focus:ring-2 focus:ring-border-brand",
                  )}
                >
                  <option value={UNIT_ALL_VALUE}>Todas as unidades</option>
                  {units!.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="text-[11px] text-content-tertiary">
                  {canSeeAllUnits ? "Todas as unidades" : "Unidade fixa"}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Links */}
      <div className="flex-1 space-y-1 px-2 pb-4 pt-4">
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
