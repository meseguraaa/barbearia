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

type WindowOption = {
  value: 30 | 60 | 90;
  label: string;
};

const DEFAULT_OPTIONS: WindowOption[] = [
  { value: 30, label: "30 dias" },
  { value: 60, label: "60 dias" },
  { value: 90, label: "90 dias" },
];

function safeWindow(value?: number | null): 30 | 60 | 90 {
  if (value === 60) return 60;
  if (value === 90) return 90;
  return 30;
}

export function RetentionWindowFilter({
  value,
  paramKey = "window",
  label = "Janela",
  options = DEFAULT_OPTIONS,
}: {
  value?: number | null;
  paramKey?: string;
  label?: string;
  options?: WindowOption[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const selected = useMemo(() => {
    const safe = safeWindow(value);
    return String(safe);
  }, [value]);

  function setParam(nextValue: string) {
    const next = Number(nextValue);
    const safe = safeWindow(Number.isFinite(next) ? next : null);

    const params = new URLSearchParams(searchParams?.toString());
    params.set(paramKey, String(safe));

    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div className="space-y-2">
      <p className="text-label-small text-content-secondary">{label}</p>

      <Select value={selected} onValueChange={setParam}>
        <SelectTrigger className="h-12 min-h-12 py-2">
          <SelectValue placeholder="Selecione" />
        </SelectTrigger>

        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={String(o.value)}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
