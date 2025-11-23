// app/barber/page.tsx
import { redirect } from "next/navigation";

export default function BarberIndexPage() {
  redirect("/barber/dashboard");
}
