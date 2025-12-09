// app/admin/review-tags/page.tsx
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ServiceStatusBadge } from "@/components/service-status-badge";
import {
  createReviewTagAction,
  toggleReviewTagStatusAction,
  updateReviewTagLabelAction,
} from "./actions";
import { requireAdminPermission } from "@/lib/admin-permissions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin | Motivos de avaliação",
};

export default async function AdminReviewTagsPage() {
  // 🔐 Permissão: precisa ter acesso a Avaliação (ou ser Dono)
  await requireAdminPermission("canAccessReviews");

  const tags = await prisma.reviewTag.findMany({
    orderBy: {
      label: "asc",
    },
  });

  const activeTags = tags.filter((t) => t.isActive);
  const inactiveTags = tags.filter((t) => !t.isActive);

  return (
    <div className="space-y-8 max-w-4xl">
      {/* HEADER */}
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-title text-content-primary">
            Motivos de avaliação
          </h1>
          <p className="text-paragraph-medium text-content-secondary">
            Cadastre os motivos que o cliente pode selecionar ao avaliar um
            atendimento (no máximo 3 por avaliação).
          </p>
        </div>
      </header>

      {/* FORM NOVO MOTIVO */}
      <section className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-4 space-y-3">
        <p className="text-label-small text-content-primary">
          Adicionar novo motivo
        </p>
        <form
          action={createReviewTagAction}
          className="flex flex-col gap-3 sm:flex-row sm:items-center"
        >
          <Input
            name="label"
            placeholder="Ex.: Atendimento rápido, Ambiente agradável..."
            className="bg-background-secondary border-border-primary text-content-primary placeholder:text-content-tertiary"
          />
          <Button type="submit" variant="brand">
            Salvar motivo
          </Button>
        </form>
        <p className="text-paragraph-small text-content-tertiary">
          Esses motivos aparecem como botões para o cliente escolher (até 3) ao
          avaliar um atendimento.
        </p>
      </section>

      {/* LISTA DE MOTIVOS ATIVOS */}
      <section className="space-y-3">
        <h2 className="text-paragraph-medium text-content-primary">
          Motivos ativos
        </h2>

        {activeTags.length === 0 ? (
          <div className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-6">
            <p className="text-paragraph-small text-content-secondary text-center">
              Nenhum motivo ativo no momento. Cadastre acima ou ative um motivo
              inativo.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {activeTags.map((tag) => (
              <div
                key={tag.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border-primary bg-background-tertiary px-4 py-3"
              >
                {/* ESQUERDA: status + edição do texto */}
                <form
                  action={updateReviewTagLabelAction}
                  className="flex flex-1 items-center gap-3 min-w-0"
                >
                  <input type="hidden" name="tagId" value={tag.id} />

                  <ServiceStatusBadge isActive={tag.isActive} />

                  <Input
                    name="label"
                    defaultValue={tag.label}
                    className="flex-1 bg-background-secondary border-border-primary text-content-primary placeholder:text-content-tertiary"
                  />

                  <Button
                    type="submit"
                    size="sm"
                    variant="brand"
                    className="border-border-primary whitespace-nowrap"
                  >
                    Salvar texto
                  </Button>
                </form>

                {/* DIREITA: ativar / desativar */}
                <form action={toggleReviewTagStatusAction}>
                  <input type="hidden" name="tagId" value={tag.id} />
                  <Button
                    type="submit"
                    variant="destructive"
                    size="sm"
                    className="border-border-primary hover:bg-muted/40 whitespace-nowrap"
                  >
                    Desativar
                  </Button>
                </form>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* LISTA DE MOTIVOS INATIVOS */}
      <section className="space-y-3">
        <h2 className="text-paragraph-medium text-content-secondary">
          Motivos inativos
        </h2>

        {inactiveTags.length === 0 ? (
          <div className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-6">
            <p className="text-paragraph-small text-content-secondary text-center">
              Nenhum motivo inativo no momento.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {inactiveTags.map((tag) => (
              <div
                key={tag.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border-primary bg-background-tertiary px-4 py-3"
              >
                {/* ESQUERDA: status + edição do texto */}
                <form
                  action={updateReviewTagLabelAction}
                  className="flex flex-1 items-center gap-3 min-w-0"
                >
                  <input type="hidden" name="tagId" value={tag.id} />

                  <ServiceStatusBadge isActive={tag.isActive} />

                  <Input
                    name="label"
                    defaultValue={tag.label}
                    className="flex-1 bg-background-secondary border-border-primary text-content-primary placeholder:text-content-tertiary"
                  />

                  <Button
                    type="submit"
                    size="sm"
                    variant="brand"
                    className="border-border-primary whitespace-nowrap"
                  >
                    Salvar texto
                  </Button>
                </form>

                {/* DIREITA: ativar */}
                <form action={toggleReviewTagStatusAction}>
                  <input type="hidden" name="tagId" value={tag.id} />
                  <Button
                    type="submit"
                    variant="active"
                    size="sm"
                    className="border-border-primary hover:bg-muted/40 whitespace-nowrap"
                  >
                    Ativar
                  </Button>
                </form>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
