import { Button } from "@/components/ui/button";

export function OrdersFilters({
  monthParam,
  pageSize,
  clearHref,
  barbers,

  filterQ,
  filterStatus,
  filterType,
  filterBarberId,
  filterMin,
  filterMax,
}: {
  monthParam?: string;
  pageSize: number;
  clearHref: string;
  barbers: Array<{ id: string; name: string }>;

  filterQ: string;
  filterStatus: string;
  filterType: "SERVICES" | "PRODUCTS" | "BOTH";
  filterBarberId: string;
  filterMin: string;
  filterMax: string;
}) {
  return (
    <section className="rounded-xl border border-border-primary bg-background-tertiary p-4 space-y-3">
      <form method="get" className="space-y-3">
        {/* mantém month/pageSize e reseta page=1 ao filtrar */}
        {monthParam && <input type="hidden" name="month" value={monthParam} />}
        <input type="hidden" name="page" value="1" />
        <input type="hidden" name="pageSize" value={String(pageSize)} />

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="md:col-span-2">
            <label className="text-label-small text-content-secondary">
              Buscar
            </label>
            <input
              name="q"
              defaultValue={filterQ}
              className="mt-1 h-9 w-full rounded-md border border-border-primary bg-background-secondary px-3 text-sm text-content-primary"
              placeholder="Cliente, email ou #pedido (id)"
            />
          </div>

          <div>
            <label className="text-label-small text-content-secondary">
              Status
            </label>
            <select
              name="status"
              defaultValue={filterStatus || ""}
              className="mt-1 h-9 w-full rounded-md border border-border-primary bg-background-secondary px-2 text-sm text-content-primary"
            >
              <option value="">Todos</option>
              <option value="PENDING">Pendente</option>
              <option value="PENDING_CHECKIN">Pendente (retirada)</option>
              <option value="COMPLETED">Pago</option>
              <option value="CANCELED">Cancelado</option>
            </select>
          </div>

          <div>
            <label className="text-label-small text-content-secondary">
              Tipo
            </label>
            <select
              name="type"
              defaultValue={filterType}
              className="mt-1 h-9 w-full rounded-md border border-border-primary bg-background-secondary px-2 text-sm text-content-primary"
            >
              <option value="BOTH">Serviços + Produtos</option>
              <option value="SERVICES">Só serviços</option>
              <option value="PRODUCTS">Só produtos</option>
            </select>
          </div>

          <div>
            <label className="text-label-small text-content-secondary">
              Profissional
            </label>
            <select
              name="barberId"
              defaultValue={filterBarberId || ""}
              className="mt-1 h-9 w-full rounded-md border border-border-primary bg-background-secondary px-2 text-sm text-content-primary"
            >
              <option value="">Todos</option>
              {barbers.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-label-small text-content-secondary">
              Valor mín.
            </label>
            <input
              name="min"
              inputMode="decimal"
              defaultValue={filterMin}
              className="mt-1 h-9 w-full rounded-md border border-border-primary bg-background-secondary px-3 text-sm text-content-primary"
              placeholder="0"
            />
          </div>

          <div>
            <label className="text-label-small text-content-secondary">
              Valor máx.
            </label>
            <input
              name="max"
              inputMode="decimal"
              defaultValue={filterMax}
              className="mt-1 h-9 w-full rounded-md border border-border-primary bg-background-secondary px-3 text-sm text-content-primary"
              placeholder="9999"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button type="submit" variant="brand" size="sm">
            Aplicar filtros
          </Button>

          {/* Server-friendly: limpar via link */}
          <a href={clearHref}>
            <Button type="button" variant="outline" size="sm">
              Limpar
            </Button>
          </a>
        </div>
      </form>
    </section>
  );
}
