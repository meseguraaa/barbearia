// app/admin/settings/page.tsx
import { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { AdminNewAdminDialog } from "@/components/admin-new-admin-dialog";
import { AdminPermissionsForm } from "@/components/admin-permissions-form";
import { AdminEditAdminDialog } from "@/components/admin-edit-admin-dialog";
import { AdminToggleAdminStatusButton } from "@/components/admin-toggle-admin-status-button";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin | Configurações",
};

type AdminRow = {
  id: string;
  name: string;
  email: string;
  phone: string;
  birthday: Date | null;
  createdAt: Date;
  isOwner: boolean;
  isActive: boolean;
  permissions: {
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
};

export default async function SettingsPage() {
  const admins = await prisma.user.findMany({
    where: { role: "ADMIN" },
    include: {
      adminAccess: true,
    },
    orderBy: {
      name: "asc",
    },
  });

  if (admins.length === 0) {
    return (
      <div className="max-w-7xl mx-auto space-y-6">
        <header className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-title text-content-primary">Configurações</h1>
            <p className="text-paragraph-medium text-content-secondary">
              Nenhum administrador cadastrado ainda.
            </p>
          </div>

          <AdminNewAdminDialog />
        </header>
      </div>
    );
  }

  const rows: AdminRow[] = admins.map((admin) => {
    const phone = (admin as any).phone as string | null | undefined;

    return {
      id: admin.id,
      name: admin.name ?? "Admin sem nome",
      email: admin.email ?? "",
      phone: phone || "—",
      birthday: (admin as any).birthday ?? null,
      createdAt: admin.createdAt,
      isOwner: (admin as any).isOwner ?? false,
      isActive: (admin as any).isActive ?? true,
      permissions: {
        canAccessDashboard: admin.adminAccess?.canAccessDashboard ?? false,
        canAccessCheckout: admin.adminAccess?.canAccessCheckout ?? false,
        canAccessAppointments:
          admin.adminAccess?.canAccessAppointments ?? false,
        canAccessProfessionals:
          admin.adminAccess?.canAccessProfessionals ?? false,
        canAccessServices: admin.adminAccess?.canAccessServices ?? false,
        canAccessReviews: admin.adminAccess?.canAccessReviews ?? false,
        canAccessProducts: admin.adminAccess?.canAccessProducts ?? false,
        canAccessClients: admin.adminAccess?.canAccessClients ?? false,
        canAccessFinance: admin.adminAccess?.canAccessFinance ?? false,
      },
    };
  });

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      {/* HEADER GERAL */}
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-title text-content-primary">Configurações</h1>
          <p className="text-paragraph-medium text-content-secondary">
            Controle quais administradores têm acesso a cada módulo do painel.
          </p>
        </div>
        <AdminNewAdminDialog />
      </header>

      {/* LISTA EM ACCORDION */}
      <section className="space-y-4">
        <Accordion type="single" collapsible className="space-y-2">
          {rows.map((row) => (
            <AccordionItem
              key={row.id}
              value={row.id}
              className="border border-border-primary rounded-xl bg-background-tertiary"
            >
              {/* LINHA SUPERIOR: Trigger + Tipo + Ações */}
              <div className="flex items-center justify-between gap-4 px-4 py-3">
                <AccordionTrigger className="flex flex-1 items-center gap-6 hover:no-underline px-0 py-0">
                  {/* COLUNA: Nome + Email */}
                  <div className="flex flex-col text-left min-w-60 flex-1">
                    <p className="text-paragraph-medium font-semibold text-content-primary">
                      {row.name}
                    </p>

                    <p className="text-xs text-content-secondary truncate max-w-[260px]">
                      {row.email || "Sem e-mail"}
                    </p>
                  </div>

                  {/* COLUNA: Telefone */}
                  <div className="hidden md:flex flex-col text-left w-[140px]">
                    <span className="text-[11px] text-content-secondary">
                      Telefone
                    </span>
                    <span className="text-xs text-content-primary">
                      {row.phone}
                    </span>
                  </div>

                  {/* COLUNA: Tipo */}
                  <div className="hidden sm:flex flex-col text-left w-[180px]">
                    <span className="text-[11px] text-content-secondary">
                      Tipo
                    </span>
                    <span className="text-xs text-content-primary">
                      {row.isOwner
                        ? "Dono (acesso total)"
                        : "Admin configurável"}
                    </span>
                  </div>
                </AccordionTrigger>

                {/* AÇÕES HEADER (só para não-dono) */}
                {!row.isOwner && (
                  <div className="flex items-center gap-2">
                    <AdminEditAdminDialog
                      admin={{
                        id: row.id,
                        name: row.name,
                        email: row.email,
                        phone: row.phone,
                        birthday: row.birthday,
                      }}
                    />
                    <AdminToggleAdminStatusButton
                      userId={row.id}
                      isActive={row.isActive}
                    />
                  </div>
                )}
              </div>

              {/* CONTEÚDO: cards internos */}
              <AccordionContent className="border-t border-border-primary px-4 py-4">
                <div className="grid gap-4 md:grid-cols-2">
                  {/* Dados do admin */}
                  <div className="rounded-xl border border-border-primary bg-background-secondary p-4 space-y-2">
                    <p className="text-label-small text-content-primary">
                      Dados do admin
                    </p>
                    <div className="space-y-1 text-paragraph-small">
                      <p>
                        <span className="text-content-secondary">Nome: </span>
                        <span className="text-content-primary font-medium">
                          {row.name}
                        </span>
                      </p>
                      <p>
                        <span className="text-content-secondary">E-mail: </span>
                        <span className="text-content-primary">
                          {row.email || "—"}
                        </span>
                      </p>
                      <p>
                        <span className="text-content-secondary">
                          Telefone:{" "}
                        </span>
                        <span className="text-content-primary">
                          {row.phone}
                        </span>
                      </p>
                      <p>
                        <span className="text-content-secondary">
                          Nascimento:{" "}
                        </span>
                        <span className="text-content-primary">
                          {row.birthday
                            ? format(row.birthday, "dd/MM/yyyy", {
                                locale: ptBR,
                              })
                            : "Não informado"}
                        </span>
                      </p>
                      <p>
                        <span className="text-content-secondary">
                          Cadastrado em:{" "}
                        </span>
                        <span className="text-content-primary">
                          {format(row.createdAt, "dd/MM/yyyy HH:mm", {
                            locale: ptBR,
                          })}
                        </span>
                      </p>
                      <p>
                        <span className="text-content-secondary">Status: </span>
                        <span className="text-content-primary font-medium">
                          {row.isActive ? "Ativo" : "Inativo"}
                        </span>
                      </p>
                    </div>
                  </div>

                  {/* Permissões */}
                  <div className="rounded-xl border border-border-primary bg-background-secondary p-4 space-y-3">
                    <p className="text-label-small text-content-primary">
                      Permissões de acesso
                    </p>

                    {row.isOwner ? (
                      <p className="text-paragraph-small text-content-secondary">
                        Este usuário é o <strong>dono</strong> do
                        estabelecimento e possui acesso total a todos os
                        módulos.
                      </p>
                    ) : (
                      <AdminPermissionsForm
                        userId={row.id}
                        initialPermissions={row.permissions}
                      />
                    )}
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>
    </div>
  );
}
