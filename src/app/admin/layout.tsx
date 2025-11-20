import type { ReactNode } from "react";
import { AdminNav } from "@/components/admin-nav";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b">
        <div className="container flex h-16 items-center justify-between gap-4">
          <AdminNav />
        </div>
      </header>

      <main className="container py-6 flex-1">{children}</main>
    </div>
  );
}
