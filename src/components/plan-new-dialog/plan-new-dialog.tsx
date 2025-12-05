import type { Service } from "@prisma/client";

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
import { createPlan } from "@/app/admin/services/actions";

type PlanNewDialogProps = {
  services: Service[];
};

export function PlanNewDialog({ services }: PlanNewDialogProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="brand">Novo plano</Button>
      </DialogTrigger>

      <DialogContent className="bg-background-secondary border border-border-primary max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-title text-content-primary">
            Novo plano
          </DialogTitle>
        </DialogHeader>

        <form
          action={async (formData) => {
            "use server";
            await createPlan(formData);
            redirect("/admin/services");
          }}
          className="space-y-4"
        >
          {/* NOME */}
          <div className="space-y-1">
            <label className="text-label-small text-content-secondary">
              Nome do plano
            </label>
            <Input
              name="name"
              required
              placeholder="Ex: Plano Mensal 4 cortes"
              className="bg-background-tertiary border-border-primary text-content-primary"
            />
          </div>

          {/* DESCRIÇÃO */}
          <div className="space-y-1">
            <label className="text-label-small text-content-secondary">
              Descrição (opcional)
            </label>
            <Input
              name="description"
              placeholder="Ex: 4 agendamentos em 30 dias"
              className="bg-background-tertiary border-border-primary text-content-primary"
            />
          </div>

          {/* PREÇO DO PLANO */}
          <div className="space-y-1">
            <label className="text-label-small text-content-secondary">
              Valor do plano (R$)
            </label>
            <Input
              name="price"
              type="number"
              step="0.01"
              required
              placeholder="Ex: 400"
              className="bg-background-tertiary border-border-primary text-content-primary"
            />
          </div>

          {/* PORCENTAGEM COMISSÃO */}
          <div className="space-y-1">
            <label className="text-label-small text-content-secondary">
              Comissão do barbeiro sobre o plano (%)
            </label>
            <Input
              name="commissionPercent"
              type="number"
              step="0.01"
              min={0}
              max={100}
              required
              placeholder="Ex: 50"
              className="bg-background-tertiary border-border-primary text-content-primary"
            />
          </div>

          {/* INFO FIXA SOBRE DURAÇÃO E QUANTIDADE */}
          <div className="space-y-1">
            <p className="text-label-small text-content-secondary">
              Este plano terá{" "}
              <span className="font-semibold">4 agendamentos</span> em até{" "}
              <span className="font-semibold">30 dias</span>.
            </p>
            <input type="hidden" name="durationDays" value="30" />
            <input type="hidden" name="totalBookings" value="4" />
          </div>

          {/* SERVIÇOS INCLUÍDOS */}
          <div className="space-y-2">
            <p className="text-label-small text-content-secondary">
              Serviços incluídos no plano
            </p>

            {services.length === 0 ? (
              <p className="text-xs text-content-secondary">
                Cadastre serviços antes de criar um plano.
              </p>
            ) : (
              <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-border-primary bg-background-tertiary px-3 py-2">
                {services.map((service) => (
                  <label
                    key={service.id}
                    className="flex items-center justify-between gap-2 text-xs text-content-primary"
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        name="serviceIds"
                        value={service.id}
                        className="h-3 w-3"
                      />
                      <span>{service.name}</span>
                    </div>
                    <span className="text-content-secondary">
                      R$ {Number(service.price).toFixed(2)}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="submit"
              variant="brand"
              disabled={services.length === 0}
            >
              Criar plano
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
