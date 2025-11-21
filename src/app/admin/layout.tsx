import type { ReactNode } from "react";
import { AdminNav } from "@/components/admin-nav";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background-primary text-content-primary flex flex-col">
      <header className="border-b border-border-primary bg-background-secondary">
        <div className="max-w-7xl mx-auto flex h-16 items-center justify-between gap-4 px-4">
          <AdminNav />
        </div>
      </header>

      <main className="flex-1 px-4 py-6">
        <div className="max-w-7xl mx-auto">
          <section className="rounded-2xl border border-border-primary bg-background-secondary shadow-lg px-6 py-5">
            {children}
          </section>
        </div>
      </main>
    </div>
  );
}
