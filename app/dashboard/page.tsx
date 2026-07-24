import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getLabels } from "@/lib/labels";
import { startOfWeek, addDays, startOfDay, endOfDay, isSameDay, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { WeekCalendarClient } from "./WeekCalendarClient";

export default async function GroupDashboard({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; view?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const user = session.user as any;
  if (user.role === "SUPER_ADMIN") redirect("/admin");
  if (user.role === "PROFESSIONAL") redirect(`/dashboard/${user.professionalId}`);

  const { week: weekParam, view = "workweek" } = await searchParams;
  const reference = weekParam ? new Date(`${weekParam}T00:00:00`) : new Date();
  const weekStart = startOfWeek(reference, { weekStartsOn: 1 });
  const dayCount = view === "week" ? 7 : 5;
  const days = Array.from({ length: dayCount }, (_, i) => addDays(weekStart, i));

  const rangeStart = startOfDay(days[0]);
  const rangeEnd = endOfDay(days[days.length - 1]);

  const [professionals, appointments, tenant] = await Promise.all([
    prisma.professional.findMany({
      where: { tenantId: user.tenantId, active: true },
      include: {
        user: true,
        services: { where: { service: { active: true } }, include: { service: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.appointment.findMany({
      where: { tenantId: user.tenantId, startAt: { gte: rangeStart, lte: rangeEnd } },
      include: { professional: { include: { user: true } } },
      orderBy: { startAt: "asc" },
    }),
    prisma.tenant.findUnique({ where: { id: user.tenantId } }),
  ]);

  const labels = getLabels(tenant!.businessType, tenant!.customLabels);
  const today = new Date();

  const columns = days.map((day) => ({
    id: format(day, "yyyy-MM-dd"),
    label: format(day, "d"),
    sublabel: format(day, "EEE", { locale: ptBR }),
    color: "var(--teal)",
    isToday: isSameDay(day, today),
    appointments: appointments
      .filter((a) => isSameDay(a.startAt, day) && a.status !== "CANCELLED")
      .map((a) => ({
        id: a.id,
        patientName: a.patientName,
        sublabel: a.professional.user.name,
        startAt: a.startAt.toISOString(),
        endAt: a.endAt.toISOString(),
        status: a.status,
        accentColor: a.professional.color,
      })),
  }));

  const servicesByProfessional = Object.fromEntries(
    professionals.map((p) => [
      p.id,
      p.services.map((link) => ({
        serviceId: link.service.id,
        name: link.service.name,
        durationMin: link.durationMin ?? link.service.defaultDurationMin,
        price: link.price ?? link.service.price,
      })),
    ])
  );

  const summaryByProfessional = professionals.map((p) => {
    const apps = appointments.filter((a) => a.professionalId === p.id);
    return {
      professional: p,
      total: apps.length,
      confirmed: apps.filter((a) => a.status === "CONFIRMED" || a.status === "SCHEDULED").length,
      cancelled: apps.filter((a) => a.status === "CANCELLED").length,
    };
  });

  const prevWeek = format(addDays(weekStart, -7), "yyyy-MM-dd");
  const nextWeek = format(addDays(weekStart, 7), "yyyy-MM-dd");
  const thisWeek = format(startOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd");
  const monthLabel = format(weekStart, "MMMM yyyy", { locale: ptBR });

  return (
    <main className="flex-1 px-6 py-8 max-w-7xl mx-auto w-full" style={{ background: "var(--surface)" }}>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide mb-1" style={{ color: "var(--teal)" }}>
            {user.tenantName}
          </p>
          <h1 className="font-display text-3xl font-semibold" style={{ color: "var(--ink)" }}>
            Agenda da semana
          </h1>
        </div>
        <div className="flex gap-2 flex-wrap">
          <NavButton href="/dashboard/professionals">{labels.professionalPlural}</NavButton>
          <NavButton href="/dashboard/services">Serviços</NavButton>
          <NavButton href="/dashboard/reports">Faturamento</NavButton>
        </div>
      </div>

      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <NavButton href={`/dashboard?week=${thisWeek}&view=${view}`}>Hoje</NavButton>
          <NavButton href={`/dashboard?week=${prevWeek}&view=${view}`}>←</NavButton>
          <NavButton href={`/dashboard?week=${nextWeek}&view=${view}`}>→</NavButton>
          <span className="font-display text-lg font-semibold ml-2 capitalize" style={{ color: "var(--ink)" }}>
            {monthLabel}
          </span>
        </div>
        <div className="flex gap-2">
          <NavButton href={`/dashboard?week=${format(weekStart, "yyyy-MM-dd")}&view=workweek`} active={view !== "week"}>
            Semana útil
          </NavButton>
          <NavButton href={`/dashboard?week=${format(weekStart, "yyyy-MM-dd")}&view=week`} active={view === "week"}>
            Semana toda
          </NavButton>
        </div>
      </div>

      {professionals.length === 0 ? (
        <div
          className="rounded-2xl p-8 text-center"
          style={{ background: "var(--surface-card)", border: "1px solid var(--line)" }}
        >
          <p className="text-sm mb-3" style={{ color: "var(--ink-soft)" }}>
            Nenhum {labels.professional.toLowerCase()} cadastrado ainda.
          </p>
          <Link href="/dashboard/professionals" className="text-sm font-medium underline" style={{ color: "var(--teal)" }}>
            Cadastrar o primeiro
          </Link>
        </div>
      ) : (
        <WeekCalendarClient
          columns={columns}
          columnDates={days.map((d) => d.toISOString())}
          professionals={professionals.map((p) => ({ id: p.id, name: p.user.name }))}
          servicesByProfessional={servicesByProfessional}
          patientLabel={labels.patient}
        />
      )}

      {professionals.length > 0 && (
        <>
          <h2 className="font-display text-xl font-semibold mt-10 mb-4" style={{ color: "var(--ink)" }}>
            Por {labels.professional.toLowerCase()} nesta semana
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {summaryByProfessional.map(({ professional, total, confirmed, cancelled }) => (
              <Link
                key={professional.id}
                href={`/dashboard/${professional.id}`}
                className="rounded-2xl p-5 block transition-shadow hover:shadow-md"
                style={{ background: "var(--surface-card)", border: "1px solid var(--line)" }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: professional.color }} />
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
          </div>
        </>
      )}
    </main>
  );
}

function NavButton({ href, children, active }: { href: string; children: React.ReactNode; active?: boolean }) {
  return (
    <Link
      href={href}
      className="px-3 py-2 rounded-lg text-sm font-medium"
      style={{
        background: active ? "var(--teal)" : "var(--surface-card)",
        color: active ? "#fff" : "var(--ink)",
        border: "1px solid var(--line)",
      }}
    >
      {children}
    </Link>
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
