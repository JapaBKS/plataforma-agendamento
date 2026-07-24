import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { NewTenantForm } from "./NewTenantForm";

export default async function NewTenantPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const user = session.user as any;
  if (user.role !== "SUPER_ADMIN") redirect("/dashboard");

  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || "lvh.me";

  return (
    <main className="flex-1 px-6 py-8 max-w-2xl mx-auto w-full" style={{ background: "var(--surface)" }}>
      <Link href="/admin" className="text-sm mb-4 inline-block" style={{ color: "var(--teal)" }}>
        ← Voltar para clientes
      </Link>
      <h1 className="font-display text-3xl font-semibold mb-6" style={{ color: "var(--ink)" }}>
        Novo cliente
      </h1>

      <NewTenantForm rootDomain={rootDomain} />
    </main>
  );
}
