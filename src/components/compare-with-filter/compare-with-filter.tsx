// src/components/compare-with-filter.tsx
"use client";

import { useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type CompareOption = {
  value: "prev_month" | "prev_year";
  label: string;
};

const DEFAULT_OPTIONS: CompareOption[] = [
  { value: "prev_month", label: "Mês anterior" },
  { value: "prev_year", label: "Mesmo mês do ano anterior" },
];

export function CompareWithFilter({
  value,
  paramKey = "compare",
  label = "Comparar com",
  options = DEFAULT_OPTIONS,
}: {
  value?: "prev_month" | "prev_year" | null;
  paramKey?: string;
  label?: string;
  options?: CompareOption[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const selected = useMemo(() => {
    const safe = options.some((o) => o.value === value) ? value : null;
    return safe ?? "prev_month"; // ✅ default: mês anterior
  }, [options, value]);

  function setParam(nextValue: "prev_month" | "prev_year") {
    const params = new URLSearchParams(searchParams?.toString());

    params.set(paramKey, nextValue);

    // ✅ reset opcional (se um dia fizer sentido):
    // params.delete("page");

    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div className="space-y-2">
      <p className="text-label-small text-content-secondary">{label}</p>

      <Select value={selected} onValueChange={(v) => setParam(v as any)}>
        <SelectTrigger className="h-12 min-h-12 py-2">
          <SelectValue placeholder="Selecione" />
        </SelectTrigger>

        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
