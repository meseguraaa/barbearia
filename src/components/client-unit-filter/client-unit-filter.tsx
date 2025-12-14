"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useTransition } from "react";

const UNIT_ALL_VALUE = "all";

export function ClientUnitFilter({
  units,
  defaultValue,
}: {
  units: Array<{ id: string; name: string }>;
  defaultValue: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const currentQuery = useMemo(() => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    return params;
  }, [searchParams]);

  function handleChange(next: string) {
    const params = new URLSearchParams(currentQuery);
    params.set("unit", next || UNIT_ALL_VALUE);

    startTransition(() => {
      router.push(`/client/products?${params.toString()}`);
      router.refresh();
    });
  }

  return (
    <div className="sm:min-w-60">
      <label className="block text-xs font-medium text-content-secondary mb-1">
        Filtrar por unidade
      </label>

      <select
        defaultValue={defaultValue}
        disabled={isPending}
        onChange={(e) => handleChange(e.currentTarget.value)}
        className="h-10 w-full rounded-md border border-border-primary bg-background-secondary px-3 text-sm text-content-primary disabled:opacity-60"
      >
        <option value={UNIT_ALL_VALUE}>Todas as unidades</option>
        {units.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
      </select>
    </div>
  );
}
