import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getLabels } from "@/lib/labels";

export default async function AdminPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const user = session.user as any;
  if (user.role !== "SUPER_ADMIN") redirect("/dashboard");

  const tenants = await prisma.tenant.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { users: true, professionals: true, appointments: true } } },
  });

  return (
    <main className="flex-1 px-6 py-8 max-w-5xl mx-auto w-full" style={{ background: "var(--surface)" }}>
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide mb-1" style={{ color: "var(--teal)" }}>
            Administração da plataforma
          </p>
          <h1 className="font-display text-3xl font-semibold" style={{ color: "var(--ink)" }}>
            Clientes
          </h1>
        </div>
        <Link
          href="/admin/new"
          className="px-4 py-2 rounded-lg text-sm font-medium text-white"
          style={{ background: "var(--teal)" }}
        >
          + Novo cliente
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {tenants.map((t) => {
          const labels = getLabels(t.businessType, t.customLabels);
          return (
            <div
              key={t.id}
              className="rounded-2xl p-5"
              style={{ background: "var(--surface-card)", border: "1px solid var(--line)" }}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: t.primaryColor }} />
                <span className="font-medium" style={{ color: "var(--ink)" }}>
                  {t.name}
                </span>
                <span
                  className="text-xs font-medium px-2 py-0.5 rounded-full"
                  style={{ background: "var(--surface)", color: "var(--ink-soft)", border: "1px solid var(--line)" }}
                >
                  {t.plan}
                </span>
                {!t.active && (
                  <span
                    className="text-xs font-medium px-2 py-0.5 rounded-full ml-1"
                    style={{ background: "var(--amber)", color: "#fff" }}
                  >
                    inativo
                  </span>
                )}
              </div>
              <p className="text-xs mb-4" style={{ color: "var(--ink-soft)" }}>
                {t.slug} · {labels.professionalPlural.toLowerCase()} / {labels.appointmentPlural.toLowerCase()}
              </p>
              <div className="flex gap-6 text-sm">
                <Metric label="Usuários" value={t._count.users} />
                <Metric label={labels.professionalPlural} value={t._count.professionals} />
                <Metric label={labels.appointmentPlural} value={t._count.appointments} />
              </div>
            </div>
          );
        })}
        {tenants.length === 0 && (
          <p className="text-sm col-span-full" style={{ color: "var(--ink-soft)" }}>
            Nenhum cliente cadastrado ainda.
          </p>
        )}
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="font-display text-lg font-semibold" style={{ color: "var(--ink)" }}>
        {value}
      </p>
      <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
        {label}
      </p>
    </div>
  );
}
