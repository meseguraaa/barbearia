"use client";

import { useMemo, useState, useTransition } from "react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UploadImageField } from "@/components/upload-image-field/upload-image-field";
import { createBarber } from "@/app/admin/professional/actions";
import { toast } from "sonner";

type UnitOption = {
  id: string;
  name: string;
  isActive: boolean;
};

export function ProfessionalNewDialog({ units }: { units: UnitOption[] }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [phone, setPhone] = useState("");
  const [selectedUnitIds, setSelectedUnitIds] = useState<string[]>([]);

  const hasUnits = (units?.length ?? 0) > 0;

  const selectedCountLabel = useMemo(() => {
    if (selectedUnitIds.length === 0) return "Nenhuma selecionada";
    if (selectedUnitIds.length === 1) return "1 unidade selecionada";
    return `${selectedUnitIds.length} unidades selecionadas`;
  }, [selectedUnitIds.length]);

  function handlePhoneChange(e: React.ChangeEvent<HTMLInputElement>) {
    let value = e.target.value.replace(/\D/g, "").slice(0, 11);

    if (value.length <= 10) {
      value = value
        .replace(/(\d{2})(\d)/, "($1) $2")
        .replace(/(\d{4})(\d)/, "$1-$2");
    } else {
      value = value
        .replace(/(\d{2})(\d)/, "($1) $2")
        .replace(/(\d{5})(\d)/, "$1-$2");
    }

    setPhone(value);
  }

  function toggleUnit(id: string) {
    setSelectedUnitIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function handleCreate(formData: FormData) {
    if (!hasUnits) {
      toast.error(
        "Crie pelo menos 1 unidade antes de cadastrar profissionais.",
      );
      return;
    }

    // ✅ só pode escolher unidades ativas (server também valida)
    const activeSelected = selectedUnitIds.filter((id) =>
      units.some((u) => u.id === id && u.isActive),
    );

    if (activeSelected.length === 0) {
      toast.error("Selecione pelo menos 1 unidade ativa.");
      return;
    }

    // injeta unitIds no FormData (multi values)
    activeSelected.forEach((id) => formData.append("unitIds", id));

    startTransition(async () => {
      const res = await createBarber(formData);

      if (!res?.ok) {
        toast.error(res?.error ?? "Erro ao criar profissional.");
        return; // ✅ não fecha o modal
      }

      toast.success("Profissional criado com sucesso!");
      setOpen(false);
      setPhone("");
      setSelectedUnitIds([]);
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !isPending && setOpen(next)}>
      <DialogTrigger asChild>
        <Button variant="brand" disabled={!hasUnits}>
          Novo profissional
        </Button>
      </DialogTrigger>

      <DialogContent className="bg-background-secondary border border-border-primary max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-title text-content-primary">
            Novo profissional
          </DialogTitle>
        </DialogHeader>

        {!hasUnits ? (
          <div className="rounded-xl border border-dashed border-border-primary bg-background-tertiary p-4 text-sm text-content-secondary">
            Você ainda não tem unidades ativas. Crie uma unidade primeiro para
            cadastrar profissionais.
          </div>
        ) : (
          <form action={handleCreate} className="space-y-4 pb-2">
            {/* UNIDADES (obrigatório) */}
            <div className="space-y-2">
              <label className="text-label-small text-content-secondary">
                Unidades <span className="text-red-500">*</span>
              </label>

              <div className="rounded-xl border border-border-primary bg-background-tertiary p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-content-secondary">
                    Selecione onde este profissional vai atuar.
                  </p>
                  <p className="text-xs text-content-secondary">
                    {selectedCountLabel}
                  </p>
                </div>

                <div className="grid gap-2">
                  {units.map((u) => {
                    const checked = selectedUnitIds.includes(u.id);
                    const disabled = !u.isActive;

                    return (
                      <label
                        key={u.id}
                        className={`flex items-center justify-between gap-3 rounded-lg border border-border-primary bg-background-secondary px-3 py-2 cursor-pointer ${
                          disabled ? "opacity-60 cursor-not-allowed" : ""
                        }`}
                      >
                        <div className="flex flex-col">
                          <span className="text-sm text-content-primary font-medium">
                            {u.name}
                          </span>
                          <span className="text-[11px] text-content-secondary">
                            {u.isActive ? "Unidade ativa" : "Unidade inativa"}
                          </span>
                        </div>

                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={disabled}
                          onChange={() => !disabled && toggleUnit(u.id)}
                          className="h-4 w-4 accent-current"
                        />
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* dica pro HTML5 */}
              <input type="hidden" name="unitIdsRequired" value="true" />
            </div>

            {/* NOME */}
            <div className="space-y-1">
              <label className="text-label-small text-content-secondary">
                Nome <span className="text-red-500">*</span>
              </label>
              <Input
                name="name"
                required
                className="bg-background-tertiary border-border-primary text-content-primary"
              />
            </div>

            {/* FOTO */}
            <UploadImageField
              name="imageUrl"
              label="Foto do profissional"
              defaultValue=""
              helperText="Essa imagem será exibida na listagem de profissionais."
            />

            {/* E-MAIL */}
            <div className="space-y-1">
              <label className="text-label-small text-content-secondary">
                E-mail <span className="text-red-500">*</span>
              </label>
              <Input
                type="email"
                name="email"
                required
                className="bg-background-tertiary border-border-primary text-content-primary"
              />
            </div>

            {/* TELEFONE */}
            <div className="space-y-1">
              <label className="text-label-small text-content-secondary">
                Telefone <span className="text-red-500">*</span>
              </label>
              <Input
                name="phone"
                required
                placeholder="(99) 99999-9999"
                value={phone}
                onChange={handlePhoneChange}
                className="bg-background-tertiary border-border-primary text-content-primary"
              />
            </div>

            {/* SENHA */}
            <div className="space-y-1">
              <label className="text-label-small text-content-secondary">
                Senha <span className="text-red-500">*</span>
              </label>
              <Input
                type="password"
                name="password"
                required
                placeholder="Defina a senha do profissional"
                className="bg-background-tertiary border-border-primary text-content-primary"
              />
              <p className="text-[11px] text-content-secondary">
                Mín. 6 caracteres, 1 maiúscula, 1 número e 1 especial
                (!@#$%^&*()_+-=[]{};':&quot;,.&lt;&gt;/?\|)
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="submit" variant="brand" disabled={isPending}>
                {isPending ? "Salvando..." : "Criar profissional"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
