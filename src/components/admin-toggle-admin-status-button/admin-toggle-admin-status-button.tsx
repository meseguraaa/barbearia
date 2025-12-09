// components/admin-toggle-admin-status-button.tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toggleAdminStatusAction } from "@/app/admin/settings/actions";
import { toast } from "sonner";

type Props = {
  userId: string;
  isActive: boolean;
};

export function AdminToggleAdminStatusButton({ userId, isActive }: Props) {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    try {
      setLoading(true);

      const formData = new FormData();
      formData.append("userId", userId);

      const result = await toggleAdminStatusAction(formData);

      if (result?.error) {
        toast.error(result.error);
        setLoading(false);
        return;
      }

      toast.success(
        isActive
          ? "Administrador inativado com sucesso!"
          : "Administrador reativado com sucesso!",
      );
    } catch (error) {
      console.error("Erro ao alterar status do admin", error);
      toast.error("Erro ao alterar status. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      type="button"
      size="sm"
      variant={isActive ? "destructive" : "active"}
      onClick={handleClick}
      disabled={loading}
    >
      {loading ? "Atualizando..." : isActive ? "Inativar" : "Reativar"}
    </Button>
  );
}
