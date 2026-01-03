// src/components/admin-settings-flash-toast.tsx
"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

function messageFromOk(ok: string) {
  if (ok === "company_updated") return "Empresa salva com sucesso!";
  if (ok === "company_created") return "Empresa criada com sucesso!";
  if (ok === "company_switched") return "Empresa trocada com sucesso!";
  return null;
}

export function AdminSettingsFlashToast() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  useEffect(() => {
    const ok = sp.get("ok");
    if (!ok) return;

    const msg = messageFromOk(ok);
    if (!msg) return;

    // ✅ trava anti “toast duplicado” (Strict Mode / remount)
    const key = `flash_toast:${pathname}:ok=${ok}`;
    if (typeof window !== "undefined") {
      if (sessionStorage.getItem(key) === "1") {
        // mesmo assim remove o ok da URL, se ainda estiver lá
        const next = new URLSearchParams(sp.toString());
        next.delete("ok");
        const qs = next.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname);
        return;
      }
      sessionStorage.setItem(key, "1");
    }

    toast.success(msg);

    // ✅ remove ok da URL para não repetir em refresh/back
    const next = new URLSearchParams(sp.toString());
    next.delete("ok");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp, pathname, router]);

  return null;
}
