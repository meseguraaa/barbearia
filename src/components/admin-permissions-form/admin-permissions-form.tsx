// components/admin-permissions-form.tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { updateAdminPermissions } from "@/app/admin/settings/actions";

type Permissions = {
  canAccessDashboard: boolean;
  canAccessCheckout: boolean;
  canAccessAppointments: boolean;
  canAccessProfessionals: boolean;
  canAccessServices: boolean;
  canAccessReviews: boolean;
  canAccessProducts: boolean;
  canAccessClients: boolean;
  canAccessClientLevels: boolean;
  canAccessFinance: boolean;
};

type AdminPermissionsFormProps = {
  userId: string;
  initialPermissions: Permissions;
};

export function AdminPermissionsForm({
  userId,
  initialPermissions,
}: AdminPermissionsFormProps) {
  const [permissions, setPermissions] =
    useState<Permissions>(initialPermissions);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  function handleToggle(key: keyof Permissions) {
    setPermissions((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      if (!dirty) setDirty(true);
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    try {
      setSaving(true);

      const formData = new FormData();
      formData.append("userId", userId);

      if (permissions.canAccessDashboard) {
        formData.append("canAccessDashboard", "on");
      }
      if (permissions.canAccessCheckout) {
        formData.append("canAccessCheckout", "on");
      }
      if (permissions.canAccessAppointments) {
        formData.append("canAccessAppointments", "on");
      }
      if (permissions.canAccessProfessionals) {
        formData.append("canAccessProfessionals", "on");
      }
      if (permissions.canAccessServices) {
        formData.append("canAccessServices", "on");
      }
      if (permissions.canAccessReviews) {
        formData.append("canAccessReviews", "on");
      }
      if (permissions.canAccessProducts) {
        formData.append("canAccessProducts", "on");
      }
      if (permissions.canAccessClients) {
        formData.append("canAccessClients", "on");
      }
      if (permissions.canAccessClientLevels) {
        formData.append("canAccessClientLevels", "on");
      }
      if (permissions.canAccessFinance) {
        formData.append("canAccessFinance", "on");
      }

      await updateAdminPermissions(formData);

      toast.success("Permissões atualizadas com sucesso!");
      setDirty(false);
    } catch (error) {
      console.error("Erro ao atualizar permissões", error);
      toast.error("Erro ao salvar permissões. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {/* 3 colunas no desktop, 1 no mobile */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-paragraph-small">
        {/* 1. DASHBOARD */}
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="canAccessDashboard"
            checked={permissions.canAccessDashboard}
            onChange={() => handleToggle("canAccessDashboard")}
            className="h-4 w-4 rounded border-border-primary bg-background-primary accent-brand-primary"
          />
          <span>Dashboard</span>
        </label>

        {/* 2. AGENDAMENTOS */}
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="canAccessAppointments"
            checked={permissions.canAccessAppointments}
            onChange={() => handleToggle("canAccessAppointments")}
            className="h-4 w-4 rounded border-border-primary bg-background-primary accent-brand-primary"
          />
          <span>Agendamentos</span>
        </label>

        {/* 3. CHECKOUT */}
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="canAccessCheckout"
            checked={permissions.canAccessCheckout}
            onChange={() => handleToggle("canAccessCheckout")}
            className="h-4 w-4 rounded border-border-primary bg-background-primary accent-brand-primary"
          />
          <span>Checkout</span>
        </label>

        {/* 4. PROFISSIONAIS */}
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="canAccessProfessionals"
            checked={permissions.canAccessProfessionals}
            onChange={() => handleToggle("canAccessProfessionals")}
            className="h-4 w-4 rounded border-border-primary bg-background-primary accent-brand-primary"
          />
          <span>Profissionais</span>
        </label>

        {/* 5. SERVIÇOS */}
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="canAccessServices"
            checked={permissions.canAccessServices}
            onChange={() => handleToggle("canAccessServices")}
            className="h-4 w-4 rounded border-border-primary bg-background-primary accent-brand-primary"
          />
          <span>Serviços</span>
        </label>

        {/* 6. AVALIAÇÃO */}
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="canAccessReviews"
            checked={permissions.canAccessReviews}
            onChange={() => handleToggle("canAccessReviews")}
            className="h-4 w-4 rounded border-border-primary bg-background-primary accent-brand-primary"
          />
          <span>Avaliação</span>
        </label>

        {/* 7. PRODUTOS */}
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="canAccessProducts"
            checked={permissions.canAccessProducts}
            onChange={() => handleToggle("canAccessProducts")}
            className="h-4 w-4 rounded border-border-primary bg-background-primary accent-brand-primary"
          />
          <span>Produtos</span>
        </label>

        {/* 8. CLIENTES */}
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="canAccessClients"
            checked={permissions.canAccessClients}
            onChange={() => handleToggle("canAccessClients")}
            className="h-4 w-4 rounded border-border-primary bg-background-primary accent-brand-primary"
          />
          <span>Clientes</span>
        </label>

        {/* 9. NÍVEL DE CLIENTE */}
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="canAccessClientLevels"
            checked={permissions.canAccessClientLevels}
            onChange={() => handleToggle("canAccessClientLevels")}
            className="h-4 w-4 rounded border-border-primary bg-background-primary accent-brand-primary"
          />
          <span>Nível de Cliente</span>
        </label>

        {/* 10. FINANCEIRO */}
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="canAccessFinance"
            checked={permissions.canAccessFinance}
            onChange={() => handleToggle("canAccessFinance")}
            className="h-4 w-4 rounded border-border-primary bg-background-primary accent-brand-primary"
          />
          <span>Financeiro</span>
        </label>
      </div>

      {dirty && (
        <div className="pt-2">
          <Button type="submit" size="sm" variant="edit2" disabled={saving}>
            {saving ? "Salvando..." : "Salvar permissões"}
          </Button>
        </div>
      )}
    </form>
  );
}
