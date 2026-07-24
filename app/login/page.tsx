import { getCurrentTenant } from "@/lib/tenant";
import { LoginForm } from "./LoginForm";

// Server Component: resolve o tenant pelo subdomínio (barbearia1.seuapp.com)
// e aplica o branding dele na tela de login. Sem subdomínio (domínio raiz),
// mostra a tela genérica - útil para o login do SUPER_ADMIN da plataforma.
export default async function LoginPage() {
  const tenant = await getCurrentTenant();
  const accentColor = tenant?.primaryColor || "var(--teal)";

  return (
    <main className="flex-1 flex items-center justify-center px-4" style={{ background: "var(--surface)" }}>
      <LoginForm tenantName={tenant?.name ?? null} accentColor={accentColor} />
    </main>
  );
}
