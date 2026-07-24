import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getLabels } from "@/lib/labels";
import { startOfMonth, endOfMonth, format } from "date-fns";
import { MonthPicker } from "./MonthPicker";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const user = session.user as any;
  if (user.role !== "ADMIN") redirect("/dashboard");

  const { month } = await searchParams;
  const reference = month ? new Date(`${month}-01T00:00:00`) : new Date();
  const rangeStart = startOfMonth(reference);
  const rangeEnd = endOfMonth(reference);
  const monthValue = format(reference, "yyyy-MM");

  const [appointments, tenant] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        tenantId: user.tenantId,
        status: "COMPLETED",
        startAt: { gte: rangeStart, lte: rangeEnd },
      },
      include: { professional: { include: { user: true } } },
    }),
    prisma.tenant.findUnique({ where: { id: user.tenantId } }),
  ]);

  const labels = getLabels(tenant!.businessType, tenant!.customLabels);

  type ProfessionalRevenue = { name: string; color: string; total: number; count: number };
  const byProfessional = new Map<string, ProfessionalRevenue>();
  for (const a of appointments) {
    const entry = byProfessional.get(a.professionalId) ?? {
      name: a.professional.user.name,
      color: a.professional.color,
      total: 0,
      count: 0,
    };
    entry.total += a.price ?? 0;
    entry.count += 1;
    byProfessional.set(a.professionalId, entry);
  }
  const results = Array.from(byProfessional.values()).sort((a, b) => b.total - a.total);
  const grandTotal = results.reduce((sum, r) => sum + r.total, 0);
  const maxTotal = Math.max(...results.map((r) => r.total), 1);

  return (
    <main className="flex-1 px-6 py-8 max-w-3xl mx-auto w-full" style={{ background: "var(--surface)" }}>
      <Link href="/dashboard" className="text-sm mb-4 inline-block" style={{ color: "var(--teal)" }}>
        ← Voltar para visão geral
      </Link>

      <div className="flex items-center justify-between mb-8 flex-wrap gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold" style={{ color: "var(--ink)" }}>
            Faturamento por {labels.professional.toLowerCase()}
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--ink-soft)" }}>
            Considera apenas {labels.appointmentPlural.toLowerCase()} marcados como concluídos
          </p>
        </div>
        <MonthPicker defaultValue={monthValue} />
      </div>

      <div
        className="rounded-2xl p-6 mb-6"
        style={{ background: "var(--surface-card)", border: "1px solid var(--line)" }}
      >
        <p className="text-xs mb-1" style={{ color: "var(--ink-soft)" }}>
          Total do mês
        </p>
        <p className="font-display text-3xl font-semibold" style={{ color: "var(--teal)" }}>
          R$ {grandTotal.toFixed(2)}
        </p>
      </div>

      <div className="space-y-3">
        {results.map((r) => (
          <div
            key={r.name}
            className="rounded-2xl p-4"
            style={{ background: "var(--surface-card)", border: "1px solid var(--line)" }}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: r.color }} />
                <span className="text-sm font-medium" style={{ color: "var(--ink)" }}>
                  {r.name}
                </span>
              </div>
              <span className="text-sm font-medium" style={{ color: "var(--ink)" }}>
                R$ {r.total.toFixed(2)}
              </span>
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--surface)" }}>
              <div
                className="h-full rounded-full"
                style={{ width: `${(r.total / maxTotal) * 100}%`, background: r.color }}
              />
            </div>
            <p className="text-xs mt-1" style={{ color: "var(--ink-soft)" }}>
              {r.count} {labels.appointmentPlural.toLowerCase()}
            </p>
          </div>
        ))}
        {results.length === 0 && (
          <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
            Nenhum {labels.appointment.toLowerCase()} concluído nesse mês ainda.
          </p>
        )}
      </div>
    </main>
  );
}
