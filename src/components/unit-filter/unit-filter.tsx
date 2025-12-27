// components/unit-filter.tsx
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type UnitOption = {
  id: string;
  name: string;
};

type UnitFilterProps = {
  units: UnitOption[];
  value: string; // cookie value atual: "all" | unitId
  label?: string;
  cookieName?: string;
  allValue?: string;
};

const DEFAULT_COOKIE_NAME = "admin_unit_context";
const DEFAULT_ALL_VALUE = "all";

function setCookie(name: string, value: string) {
  // 1 ano, path global. (igual “contexto” em admin)
  const maxAge = 60 * 60 * 24 * 365;
  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(
    value,
  )}; Path=/; Max-Age=${maxAge}; SameSite=Lax`;
}

export function UnitFilter({
  units,
  value,
  label = "Unidade",
  cookieName = DEFAULT_COOKIE_NAME,
  allValue = DEFAULT_ALL_VALUE,
}: UnitFilterProps) {
  const router = useRouter();

  const options = React.useMemo(() => {
    // "Todas" sempre em cima (pra quem pode ver tudo)
    return [{ id: allValue, name: "Todas" }, ...units];
  }, [units, allValue]);

  const safeValue = React.useMemo(() => {
    if (!value) return allValue;
    const exists = options.some((u) => u.id === value);
    return exists ? value : allValue;
  }, [value, options, allValue]);

  return (
    <div className="space-y-2">
      <p className="text-label-small text-content-secondary">{label}</p>

      <Select
        value={safeValue}
        onValueChange={(next) => {
          setCookie(cookieName, next);
          router.refresh();
        }}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Selecione" />
        </SelectTrigger>

        <SelectContent>
          {options.map((u) => (
            <SelectItem key={u.id} value={u.id}>
              {u.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
