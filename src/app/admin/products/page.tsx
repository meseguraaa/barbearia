// app/admin/products/page.tsx
import { prisma } from "@/lib/prisma";
import { Metadata } from "next";
import { redirect } from "next/navigation";

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
import { ServiceStatusBadge } from "@/components/service-status-badge";
import { UploadImageField } from "@/components/upload-image-field/upload-image-field";

import { createProduct, toggleProductStatus, updateProduct } from "./actions";
import type { Product } from "@prisma/client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin | Produtos",
};

export default async function ProductsPage() {
  const products = await prisma.product.findMany({
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6 max-w-7xl">
      {/* HEADER */}
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-title text-content-primary">Produtos</h1>
          <p className="text-paragraph-medium-size text-content-secondary">
            Gerencie os produtos disponíveis para venda.
          </p>
        </div>

        <NewProductDialog />
      </header>

      {/* TABELA */}
      <section className="overflow-x-auto rounded-xl border border-border-primary bg-background-tertiary">
        <table className="min-w-full text-sm">
          <tbody>
            {products.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-6 text-center text-paragraph-small text-content-secondary"
                >
                  Nenhum produto cadastrado ainda.
                </td>
              </tr>
            ) : (
              products.map((product) => (
                <tr key={product.id} className="border-t border-border-primary">
                  {/* NOME + FOTO */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 overflow-hidden rounded-lg border border-border-primary bg-background-secondary">
                        {product.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={product.imageUrl}
                            alt={product.name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-[10px] text-content-secondary">
                            Sem foto
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col">
                        <span className="font-medium text-content-primary">
                          {product.name}
                        </span>
                        <span className="text-[11px] text-content-secondary line-clamp-1">
                          {product.description}
                        </span>
                      </div>
                    </div>
                  </td>

                  {/* PREÇO */}
                  <td className="px-4 py-3">
                    R$ {Number(product.price).toFixed(2)}
                  </td>

                  {/* COMISSÃO DO BARBEIRO */}
                  <td className="px-4 py-3">
                    {product.barberPercentage !== null &&
                    product.barberPercentage !== undefined
                      ? `${Number(product.barberPercentage)}%`
                      : "-"}
                  </td>

                  {/* CATEGORIA / FINALIDADE */}
                  <td className="px-4 py-3">{product.category || "—"}</td>

                  {/* ESTOQUE */}
                  <td className="px-4 py-3">
                    {product.stockQuantity} unidade
                    {product.stockQuantity === 1 ? "" : "s"}
                  </td>

                  {/* STATUS */}
                  <td className="px-4 py-3">
                    <ServiceStatusBadge isActive={product.isActive} />
                  </td>

                  {/* AÇÕES */}
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      {/* EDITAR → modal inline */}
                      <EditProductDialog product={product} />

                      {/* ATIVAR / DESATIVAR */}
                      <form
                        action={async () => {
                          "use server";
                          await toggleProductStatus(product.id);
                        }}
                      >
                        <Button
                          variant={product.isActive ? "destructive" : "active"}
                          size="sm"
                          type="submit"
                          className="border-border-primary hover:bg-muted/40"
                        >
                          {product.isActive ? "Desativar" : "Ativar"}
                        </Button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

/* ========= NOVO PRODUTO (MODAL) ========= */

function NewProductDialog() {
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

        <form
          action={async (formData) => {
            "use server";
            await createProduct(formData);
            redirect("/admin/products");
          }}
          className="space-y-4 pb-2"
        >
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

/* ========= EDITAR PRODUTO (MODAL INLINE) ========= */

function EditProductDialog({ product }: { product: Product }) {
  const barberPercentageDefault =
    product.barberPercentage !== null && product.barberPercentage !== undefined
      ? String(Number(product.barberPercentage))
      : "";

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="edit2"
          size="sm"
          className="border-border-primary hover:bg-muted/40"
        >
          Editar
        </Button>
      </DialogTrigger>

      <DialogContent className="bg-background-secondary border border-border-primary max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-title text-content-primary">
            Editar produto
          </DialogTitle>
        </DialogHeader>

        <form
          action={async (formData) => {
            "use server";
            await updateProduct(product.id, formData);
            redirect("/admin/products");
          }}
          className="space-y-4 pb-2"
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
              className="bg-background-tertiary border-border-primary text-content-primary"
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
              className="bg-background-tertiary border-border-primary text-content-primary"
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
              className="bg-background-tertiary border-border-primary text-content-primary"
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
              defaultValue={barberPercentageDefault}
              placeholder="Ex: 20"
              className="bg-background-tertiary border-border-primary text-content-primary"
            />
          </div>

          {/* ESTOQUE */}
          <div className="space-y-1">
            <label className="text-label-small text-content-secondary">
              Estoque
            </label>
            <Input
              name="stockQuantity"
              type="number"
              min={0}
              defaultValue={product.stockQuantity}
              className="bg-background-tertiary border-border-primary text-content-primary"
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
              className="bg-background-tertiary border-border-primary text-content-primary"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="submit" variant="brand">
              Salvar alterações
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
