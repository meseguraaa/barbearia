// app/barber/layout.tsx
import { ReactNode } from "react";
import { BarberNav } from "@/components/barber-nav";

export default function BarberLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background-primary text-content-primary flex flex-col">
      <header className="">
        <div className="max-w-7xl mx-auto flex h-16 items-center justify-between gap-4 px-4">
          <BarberNav />
        </div>
      </header>

      <main className="flex-1 py-6">
        <div className="max-w-7xl mx-auto">
          <section className="rounded-2xl shadow-lg px-6">{children}</section>
        </div>
      </main>
    </div>
  );
}
