"use client";

import { useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Store } from "lucide-react";

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

export function ClientUnitSwitcher({
  units,
  selectedUnitId,
}: {
  units: UnitOption[];
  selectedUnitId: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const isDisabled = units.length <= 1;

  const currentLabel = useMemo(() => {
    return units.find((u) => u.id === selectedUnitId)?.name ?? "Unidade";
  }, [units, selectedUnitId]);

  const onChange = (unitId: string) => {
    const params = new URLSearchParams(searchParams?.toString());

    // ✅ sem "todas": sempre tem uma unidade selecionada
    params.set("unit", unitId);

    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="flex items-center gap-2">
      <Store className="h-4 w-4 text-content-brand" />
      <Select
        value={selectedUnitId}
        onValueChange={onChange}
        disabled={isDisabled}
      >
        <SelectTrigger className="min-w-[220px] bg-background-tertiary border-border-primary">
          <SelectValue placeholder={currentLabel} />
        </SelectTrigger>
        <SelectContent>
          {units.map((u) => (
            <SelectItem key={u.id} value={u.id}>
              {u.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
