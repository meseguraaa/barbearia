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
      // qualquer mudança ativa o botão
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
      if (permissions.canAccessFinance) {
        formData.append("canAccessFinance", "on");
      }

      await updateAdminPermissions(formData);

      toast.success("Permissões atualizadas com sucesso!");
      // esconde o botão novamente
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
      <div className="grid grid-cols-2 gap-2 text-paragraph-small">
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

      {/* botão só aparece se alguma permissão foi alterada */}
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
