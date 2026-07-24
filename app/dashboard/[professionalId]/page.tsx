import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { auth, canAccessProfessional } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getLabels } from "@/lib/labels";
import { startOfDay, endOfDay, startOfWeek, endOfWeek } from "date-fns";
import { AppointmentsPanel } from "./AppointmentsPanel";

export default async function ProfessionalDashboard({
  params,
  searchParams,
}: {
  params: Promise<{ professionalId: string }>;
  searchParams: Promise<{ range?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const user = session.user as any;
  const { professionalId } = await params;
  const { range = "day" } = await searchParams;

  const professional = await prisma.professional.findUnique({
    where: { id: professionalId },
    include: { user: true, tenant: true },
  });
  if (!professional) notFound();

  // Regra central: precisa ser do MESMO tenant, e dentro do tenant,
  // profissional só acessa a própria agenda; admin acessa qualquer uma do seu tenant.
  if (!canAccessProfessional(user, professional.tenantId, professionalId)) {
    redirect("/dashboard");
  }

  const labels = getLabels(professional.tenant.businessType, professional.tenant.customLabels);

  const now = new Date();
  const [rangeStart, rangeEnd] =
    range === "week"
      ? [startOfWeek(now, { weekStartsOn: 1 }), endOfWeek(now, { weekStartsOn: 1 })]
      : [startOfDay(now), endOfDay(now)];

  const appointments = await prisma.appointment.findMany({
    where: { professionalId, tenantId: professional.tenantId, startAt: { gte: rangeStart, lte: rangeEnd } },
    orderBy: { startAt: "asc" },
  });

  const professionalServices = await prisma.professionalService.findMany({
    where: { professionalId },
    include: { service: true },
  });
  const serviceOptions = professionalServices
    .filter((link) => link.service.active)
    .map((link) => ({
      serviceId: link.service.id,
      name: link.service.name,
      durationMin: link.durationMin ?? link.service.defaultDurationMin,
      price: link.price ?? link.service.price,
    }));

  const stats = {
    total: appointments.length,
    confirmed: appointments.filter((a) => a.status === "CONFIRMED" || a.status === "SCHEDULED").length,
    cancelled: appointments.filter((a) => a.status === "CANCELLED").length,
    completed: appointments.filter((a) => a.status === "COMPLETED").length,
  };

  return (
    <main className="flex-1 px-6 py-8 max-w-4xl mx-auto w-full" style={{ background: "var(--surface)" }}>
      {user.role === "ADMIN" && (
        <Link href="/dashboard" className="text-sm mb-4 inline-block" style={{ color: "var(--teal)" }}>
          ← Voltar para visão geral
        </Link>
      )}

      <div className="flex items-center justify-between mb-1 mt-2">
        <div className="flex items-center gap-3">
          <span className="w-3 h-3 rounded-full" style={{ background: professional.color }} />
          <h1 className="font-display text-3xl font-semibold" style={{ color: "var(--ink)" }}>
            {professional.user.name}
          </h1>
        </div>
        <div className="flex items-center gap-4">
          <Link
            href={`/dashboard/${professionalId}/calendar`}
            className="text-sm underline"
            style={{ color: "var(--teal)" }}
          >
            Ver em calendário
          </Link>
          <Link
            href={`/dashboard/${professionalId}/hours`}
            className="text-sm underline"
            style={{ color: "var(--teal)" }}
          >
            Horário de funcionamento
          </Link>
        </div>
      </div>
      {professional.specialty && (
        <p className="text-sm mb-6" style={{ color: "var(--ink-soft)" }}>
          {professional.specialty}
        </p>
      )}

      <div className="flex gap-2 mb-8">
        <Link
          href={`/dashboard/${professionalId}?range=day`}
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
          href={`/dashboard/${professionalId}?range=week`}
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

      <div className="grid grid-cols-4 gap-4 mb-10">
        <StatCard label="Total" value={stats.total} accent="var(--teal)" />
        <StatCard label="Confirmados" value={stats.confirmed} accent="var(--teal-deep)" />
        <StatCard label="Concluídos" value={stats.completed} accent="var(--sage)" />
        <StatCard label="Cancelados" value={stats.cancelled} accent="var(--amber)" />
      </div>

      <AppointmentsPanel
        professionalId={professionalId}
        initialAppointments={JSON.parse(JSON.stringify(appointments))}
        services={serviceOptions}
        appointmentLabel={labels.appointment}
        patientLabel={labels.patient}
        from={rangeStart.toISOString()}
        to={rangeEnd.toISOString()}
      />
    </main>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="rounded-2xl p-4" style={{ background: "var(--surface-card)", border: "1px solid var(--line)" }}>
      <p className="text-xs mb-1" style={{ color: "var(--ink-soft)" }}>
        {label}
      </p>
      <p className="font-display text-2xl font-semibold" style={{ color: accent }}>
        {value}
      </p>
    </div>
  );
}
