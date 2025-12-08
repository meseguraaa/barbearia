import type { ReactNode } from "react";
import { AdminNav } from "@/components/admin-nav";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background-primary text-content-primary">
      {/* Sidebar fixa à esquerda */}
      <AdminNav />

      {/* Conteúdo deslocado pra direita pra não ficar embaixo da sidebar */}
      <div className="pl-56">
        <main className="min-h-screen py-6">
          <div className="max-w-7xl mx-auto">
            <section className="px-6">{children}</section>
          </div>
        </main>
      </div>
    </div>
  );
}
