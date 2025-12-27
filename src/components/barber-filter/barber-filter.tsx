"use client";

import React, { useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

type BarberOption = { id: string; name: string };

export function BarberFilter({
  barbers,
  value,
  paramKey = "barberId",
  label = "Profissional",
  className,
}: {
  barbers: BarberOption[];
  value: string | null;
  paramKey?: "barberId" | "compareBarberId" | string;
  label?: string;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const options = useMemo(() => {
    return (barbers ?? []).map((b) => ({ id: b.id, name: b.name }));
  }, [barbers]);

  function setQuery(nextValue: string) {
    const params = new URLSearchParams(searchParams?.toString() ?? "");

    // vazio = remove filtro
    if (!nextValue) params.delete(paramKey);
    else params.set(paramKey, nextValue);

    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
    router.refresh();
  }

  return (
    <div className={cn("space-y-1", className)}>
      <p className="text-label-small text-content-secondary">{label}</p>

      <select
        value={value ?? ""}
        onChange={(e) => setQuery(e.target.value)}
        className={cn(
          "w-full h-10 rounded-md px-3",
          "bg-background-tertiary border border-border-primary",
          "text-content-primary text-sm",
          "focus:outline-none focus:ring-2 focus:ring-border-brand",
        )}
      >
        <option value="">Todos</option>
        {options.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
    </div>
  );
}
