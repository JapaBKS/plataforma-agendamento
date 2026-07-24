import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getLabels } from "@/lib/labels";
import { startOfDay, endOfDay, startOfWeek, endOfWeek } from "date-fns";

// Este dashboard em grupo é visível apenas para ADMIN, e mostra SOMENTE
// os profissionais/agendamentos do tenant do usuário logado.
export default async function GroupDashboard({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const user = session.user as any;
  if (user.role === "SUPER_ADMIN") {
    redirect("/admin");
  }
  if (user.role === "PROFESSIONAL") {
    redirect(`/dashboard/${user.professionalId}`);
  }

  const labels = getLabels(user.businessType, undefined);

  const { range = "day" } = await searchParams;
  const now = new Date();
  const [rangeStart, rangeEnd] =
    range === "week"
      ? [startOfWeek(now, { weekStartsOn: 1 }), endOfWeek(now, { weekStartsOn: 1 })]
      : [startOfDay(now), endOfDay(now)];

  const professionals = await prisma.professional.findMany({
    where: { tenantId: user.tenantId, active: true },
    include: { user: true },
  });

  const appointments = await prisma.appointment.findMany({
    where: { tenantId: user.tenantId, startAt: { gte: rangeStart, lte: rangeEnd } },
    include: { professional: { include: { user: true } } },
    orderBy: { startAt: "asc" },
  });

  const summaryByProfessional = professionals.map((p) => {
    const apps = appointments.filter((a) => a.professionalId === p.id);
    return {
      professional: p,
      total: apps.length,
      confirmed: apps.filter((a) => a.status === "CONFIRMED" || a.status === "SCHEDULED").length,
      cancelled: apps.filter((a) => a.status === "CANCELLED").length,
      completed: apps.filter((a) => a.status === "COMPLETED").length,
    };
  });

  const totals = {
    total: appointments.length,
    cancelled: appointments.filter((a) => a.status === "CANCELLED").length,
    completed: appointments.filter((a) => a.status === "COMPLETED").length,
  };

  return (
    <main className="flex-1 px-6 py-8 max-w-6xl mx-auto w-full" style={{ background: "var(--surface)" }}>
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide mb-1" style={{ color: "var(--teal)" }}>
            {user.tenantName}
          </p>
          <h1 className="font-display text-3xl font-semibold" style={{ color: "var(--ink)" }}>
            Visão geral — {labels.appointmentPlural.toLowerCase()}
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--ink-soft)" }}>
            {range === "week" ? "Resumo da semana atual" : "Resumo de hoje"}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/dashboard/calendar"
            className="px-4 py-2 rounded-lg text-sm font-medium"
            style={{ background: "var(--surface-card)", color: "var(--ink)", border: "1px solid var(--line)" }}
          >
            Agenda geral
          </Link>
          <Link
            href="/dashboard/professionals"
            className="px-4 py-2 rounded-lg text-sm font-medium"
            style={{ background: "var(--surface-card)", color: "var(--ink)", border: "1px solid var(--line)" }}
          >
            {labels.professionalPlural}
          </Link>
          <Link
            href="/dashboard/reports"
            className="px-4 py-2 rounded-lg text-sm font-medium"
            style={{ background: "var(--surface-card)", color: "var(--ink)", border: "1px solid var(--line)" }}
          >
            Faturamento
          </Link>
          <Link
            href="/dashboard/services"
            className="px-4 py-2 rounded-lg text-sm font-medium"
            style={{ background: "var(--surface-card)", color: "var(--ink)", border: "1px solid var(--line)" }}
          >
            Serviços
          </Link>
          <Link
            href="/dashboard?range=day"
            className="px-4 py-2 rounded-lg text-sm font-medium"
            style={{
              background: range === "day" ? "var(--teal)" : "var(--surface-card)",
              color: range === "day" ? "#fff" : "var(--ink)",
              border: "1px solid var(--line)",
            }}
          >
            Diário
          </Link>
          <Link
            href="/dashboard?range=week"
            className="px-4 py-2 rounded-lg text-sm font-medium"
            style={{
              background: range === "week" ? "var(--teal)" : "var(--surface-card)",
              color: range === "week" ? "#fff" : "var(--ink)",
              border: "1px solid var(--line)",
            }}
          >
            Semanal
          </Link>
        </div>
      </div>

      {/* Cards de totais gerais */}
      <div className="grid grid-cols-3 gap-4 mb-10">
        <StatCard label={labels.appointmentPlural} value={totals.total} accent="var(--teal)" />
        <StatCard label="Concluídos" value={totals.completed} accent="var(--sage)" />
        <StatCard label="Cancelados" value={totals.cancelled} accent="var(--amber)" />
      </div>

      {/* Grade por profissional */}
      <h2 className="font-display text-xl font-semibold mb-4" style={{ color: "var(--ink)" }}>
        Por {labels.professional.toLowerCase()}
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {summaryByProfessional.map(({ professional, total, confirmed, cancelled, completed }) => (
          <Link
            key={professional.id}
            href={`/dashboard/${professional.id}`}
            className="rounded-2xl p-5 block transition-shadow hover:shadow-md"
            style={{ background: "var(--surface-card)", border: "1px solid var(--line)" }}
          >
            <div className="flex items-center gap-2 mb-3">
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ background: professional.color }}
              />
              <span className="font-medium" style={{ color: "var(--ink)" }}>
                {professional.user.name}
              </span>
            </div>
            {professional.specialty && (
              <p className="text-xs mb-4" style={{ color: "var(--ink-soft)" }}>
                {professional.specialty}
              </p>
            )}
            <div className="flex justify-between text-sm">
              <Metric label="Total" value={total} />
              <Metric label="Confirmados" value={confirmed} />
              <Metric label="Cancelados" value={cancelled} />
            </div>
          </Link>
        ))}
        {professionals.length === 0 && (
          <p className="text-sm col-span-full" style={{ color: "var(--ink-soft)" }}>
            Nenhum {labels.professional.toLowerCase()} cadastrado ainda.
          </p>
        )}
      </div>
    </main>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div
      className="rounded-2xl p-5"
      style={{ background: "var(--surface-card)", border: "1px solid var(--line)" }}
    >
      <p className="text-sm mb-1" style={{ color: "var(--ink-soft)" }}>
        {label}
      </p>
      <p className="font-display text-3xl font-semibold" style={{ color: accent }}>
        {value}
      </p>
    </div>
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
