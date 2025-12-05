"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogHeader,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { UploadImageField } from "@/components/upload-image-field/upload-image-field";
import { createProductAction } from "@/app/admin/products/actions";

export function ProductNewDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="brand">Novo produto</Button>
      </DialogTrigger>

      <DialogContent className="bg-background-secondary border border-border-primary max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-title text-content-primary">
            Novo produto
          </DialogTitle>
        </DialogHeader>

        <form action={createProductAction} className="space-y-4 pb-2">
          {/* NOME */}
          <div className="space-y-1">
            <label
              className="text-label-small text-content-secondary"
              htmlFor="name"
            >
              Nome do produto
            </label>
            <Input
              id="name"
              name="name"
              required
              className="bg-background-tertiary border-border-primary text-content-primary"
            />
          </div>

          {/* FOTO (UPLOAD) */}
          <UploadImageField
            name="imageUrl"
            label="Foto do produto"
            required
            helperText="Essa imagem será exibida na listagem de produtos."
          />

          {/* DESCRIÇÃO */}
          <div className="space-y-1">
            <label
              className="text-label-small text-content-secondary"
              htmlFor="description"
            >
              Descrição
            </label>
            <Textarea
              id="description"
              name="description"
              required
              rows={3}
              className="bg-background-tertiary border-border-primary text-content-primary"
              placeholder="Descreva o produto, indicação de uso, benefícios..."
            />
          </div>

          {/* VALOR */}
          <div className="space-y-1">
            <label
              className="text-label-small text-content-secondary"
              htmlFor="price"
            >
              Valor (R$)
            </label>
            <Input
              id="price"
              name="price"
              type="text"
              required
              placeholder="Ex: 59,90"
              className="bg-background-tertiary border-border-primary text-content-primary"
            />
          </div>

          {/* PORCENTAGEM DO BARBEIRO */}
          <div className="space-y-1">
            <label
              className="text-label-small text-content-secondary"
              htmlFor="barberPercentage"
            >
              Porcentagem do barbeiro (%)
            </label>
            <Input
              id="barberPercentage"
              name="barberPercentage"
              type="number"
              min={0}
              max={100}
              required
              placeholder="Ex: 20"
              className="bg-background-tertiary border-border-primary text-content-primary"
            />
          </div>

          {/* ESTOQUE INICIAL */}
          <div className="space-y-1">
            <label
              className="text-label-small text-content-secondary"
              htmlFor="stockQuantity"
            >
              Estoque inicial
            </label>
            <Input
              id="stockQuantity"
              name="stockQuantity"
              type="number"
              min={0}
              required
              placeholder="Ex: 10"
              className="bg-background-tertiary border-border-primary text-content-primary"
            />
          </div>

          {/* CATEGORIA / FINALIDADE */}
          <div className="space-y-1">
            <label
              className="text-label-small text-content-secondary"
              htmlFor="category"
            >
              Categoria / Finalidade
            </label>
            <Input
              id="category"
              name="category"
              required
              placeholder="Ex: Barba, Cabelo, Hidratação..."
              className="bg-background-tertiary border-border-primary text-content-primary"
            />
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
