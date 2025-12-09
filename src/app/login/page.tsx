// app/login/page.tsx
import { redirect } from "next/navigation";

export default function LegacyLoginRedirectPage() {
  // Qualquer coisa que tentar mandar pra /login
  // vai cair aqui e ser redirecionada pro login novo do painel
  redirect("/painel/login");
}
