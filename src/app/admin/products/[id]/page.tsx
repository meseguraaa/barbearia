// app/admin/products/[id]/page.tsx
import { prisma } from "@/lib/prisma";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { UploadImageField } from "@/components/upload-image-field/upload-image-field";
import { updateProduct } from "../actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin | Editar produto",
};

type EditProductPageProps = {
  params: {
    id: string;
  };
};

export default async function EditProductPage({
  params,
}: EditProductPageProps) {
  const id = params?.id;

  if (!id) {
    redirect("/admin/products");
  }

  const product = await prisma.product.findUnique({
    where: { id },
  });

  if (!product) {
    redirect("/admin/products");
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* HEADER */}
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-title text-content-primary">Editar produto</h1>
          <p className="text-paragraph-medium-size text-content-secondary">
            Atualize as informações do produto.
          </p>
        </div>
      </header>

      {/* FORM */}
      <section className="rounded-xl border border-border-primary bg-background-tertiary p-6 space-y-4">
        <form
          action={async (formData) => {
            "use server";
            await updateProduct(product.id, formData);
            redirect("/admin/products");
          }}
          className="space-y-4"
        >
          {/* NOME */}
          <div className="space-y-1">
            <label className="text-label-small text-content-secondary">
              Nome do produto
            </label>
            <Input
              name="name"
              defaultValue={product.name}
              required
              className="bg-background-secondary border-border-primary text-content-primary"
            />
          </div>

          {/* FOTO (UPLOAD) */}
          <UploadImageField
            name="imageUrl"
            label="Foto do produto"
            required
            defaultValue={product.imageUrl}
            helperText="Essa imagem será exibida na listagem de produtos."
          />

          {/* DESCRIÇÃO */}
          <div className="space-y-1">
            <label className="text-label-small text-content-secondary">
              Descrição
            </label>
            <Textarea
              name="description"
              defaultValue={product.description}
              required
              rows={3}
              className="bg-background-secondary border-border-primary text-content-primary"
            />
          </div>

          {/* VALOR */}
          <div className="space-y-1">
            <label className="text-label-small text-content-secondary">
              Valor (R$)
            </label>
            <Input
              name="price"
              type="text"
              required
              defaultValue={String(product.price)}
              className="bg-background-secondary border-border-primary text-content-primary"
            />
          </div>

          {/* PORCENTAGEM DO BARBEIRO */}
          <div className="space-y-1">
            <label className="text-label-small text-content-secondary">
              Porcentagem do barbeiro (%)
            </label>
            <Input
              name="barberPercentage"
              type="number"
              min={0}
              max={100}
              defaultValue={String(product.barberPercentage ?? "")}
              placeholder="Ex: 20"
              className="bg-background-secondary border-border-primary text-content-primary"
            />
          </div>

          {/* CATEGORIA / FINALIDADE */}
          <div className="space-y-1">
            <label className="text-label-small text-content-secondary">
              Categoria / Finalidade
            </label>
            <Input
              name="category"
              defaultValue={product.category}
              required
              placeholder="Ex: Barba, Cabelo, Hidratação..."
              className="bg-background-secondary border-border-primary text-content-primary"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="submit" variant="brand">
              Salvar alterações
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}
