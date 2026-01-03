import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { redirect } from "next/navigation";
import { createService } from "@/app/admin/services/actions";
import { prisma } from "@/lib/prisma";
import { requireAdminWithPermissions } from "@/lib/admin-permissions";

type AdminContext = {
  companyId?: string;
};

export async function ServiceNewDialog() {
  // ✅ tenant context (fonte da verdade)
  const currentAdmin = (await requireAdminWithPermissions()) as AdminContext;
  const companyId = currentAdmin.companyId?.trim();

  if (!companyId) {
    throw new Error(
      "[ServiceNewDialog] ADMIN sem companyId. Este painel é multi-tenant: vincule o admin a uma empresa (companyId).",
    );
  }

  const barbers = await prisma.barber.findMany({
    where: {
      companyId,
      isActive: true,
    },
    orderBy: { name: "asc" },
  });

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="brand">Novo serviço</Button>
      </DialogTrigger>

      <DialogContent className="bg-background-secondary border border-border-primary">
        <DialogHeader>
          <DialogTitle className="text-title text-content-primary">
            Novo serviço
          </DialogTitle>
        </DialogHeader>

        <form
          action={async (formData) => {
            "use server";
            await createService(formData);
            redirect("/admin/services");
          }}
          className="space-y-4"
        >
          {/* NOME */}
          <div className="space-y-1">
            <label
              className="text-label-small text-content-secondary"
              htmlFor="name"
            >
              Nome do serviço <span className="text-red-500">*</span>
            </label>
            <Input
              id="name"
              name="name"
              required
              className="bg-background-tertiary border-border-primary text-content-primary"
            />
          </div>

          {/* VALOR */}
          <div className="space-y-1">
            <label
              className="text-label-small text-content-secondary"
              htmlFor="price"
            >
              Valor (R$) <span className="text-red-500">*</span>
            </label>
            <Input
              id="price"
              name="price"
              type="number"
              step="0.01"
              required
              className="bg-background-tertiary border-border-primary text-content-primary"
            />
          </div>

          {/* DURAÇÃO */}
          <div className="space-y-1">
            <label
              className="text-label-small text-content-secondary"
              htmlFor="durationMinutes"
            >
              Duração (minutos) <span className="text-red-500">*</span>
            </label>
            <Input
              id="durationMinutes"
              name="durationMinutes"
              type="number"
              required
              className="bg-background-tertiary border-border-primary text-content-primary"
            />
          </div>

          {/* PORCENTAGEM DO BARBEIRO */}
          <div className="space-y-1">
            <label
              className="text-label-small text-content-secondary"
              htmlFor="barberPercentage"
            >
              Porcentagem do barbeiro (%){" "}
              <span className="text-red-500">*</span>
            </label>
            <Input
              id="barberPercentage"
              name="barberPercentage"
              type="number"
              step="0.01"
              min={0}
              max={100}
              required
              placeholder="Ex: 50"
              className="bg-background-tertiary border-border-primary text-content-primary"
            />
          </div>

          {/* LIMITE DE CANCELAMENTO */}
          <div className="space-y-1">
            <label
              className="text-label-small text-content-secondary"
              htmlFor="cancelLimitHours"
            >
              Limite para cobrança de taxa (horas antes do horário){" "}
              <span className="text-red-500">*</span>
            </label>
            <Input
              id="cancelLimitHours"
              name="cancelLimitHours"
              type="number"
              min={0}
              required
              placeholder="Ex: 2 (até 2h antes)"
              className="bg-background-tertiary border-border-primary text-content-primary"
            />
          </div>

          {/* TAXA DE CANCELAMENTO */}
          <div className="space-y-1">
            <label
              className="text-label-small text-content-secondary"
              htmlFor="cancelFeePercentage"
            >
              Taxa de cancelamento (%) <span className="text-red-500">*</span>
            </label>
            <Input
              id="cancelFeePercentage"
              name="cancelFeePercentage"
              type="number"
              step="0.01"
              min={0}
              max={100}
              required
              placeholder="Ex: 50"
              className="bg-background-tertiary border-border-primary text-content-primary"
            />
          </div>

          {/* PROFISSIONAIS */}
          <div className="space-y-2">
            <p className="text-label-small text-content-secondary">
              Profissionais que realizam este serviço{" "}
              <span className="text-red-500">*</span>
            </p>

            {barbers.length === 0 ? (
              <p className="text-paragraph-small text-content-secondary">
                Nenhum profissional ativo cadastrado no momento.
              </p>
            ) : (
              <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border-primary bg-background-tertiary p-2">
                {barbers.map((barber) => (
                  <label
                    key={barber.id}
                    className="flex items-center gap-2 text-paragraph-small text-content-primary"
                  >
                    <input
                      type="checkbox"
                      name="professionalIds"
                      value={barber.id}
                      className="h-4 w-4 rounded border-border-primary"
                    />
                    <span>{barber.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="submit" variant="brand">
              Criar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
