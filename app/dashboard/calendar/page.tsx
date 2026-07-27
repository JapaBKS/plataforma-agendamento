import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getLabels } from "@/lib/labels";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { DatePicker } from "./DatePicker";
import { GroupCalendarClient } from "./GroupCalendarClient";
import { todayInBrazil, startOfDayBrazil, endOfDayBrazil } from "@/lib/timezone";

/** Soma/subtrai dias de uma data "yyyy-MM-dd" sem passar por fuso. */
function shiftYmd(ymd: string, deltaDays: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return format(new Date(y, m - 1, d + deltaDays, 12), "yyyy-MM-dd");
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const user = session.user as any;
  if (user.role === "PROFESSIONAL") redirect(`/dashboard/${user.professionalId}/calendar`);
  if (user.role === "SUPER_ADMIN") redirect("/admin");

  const { date: dateParam } = await searchParams;
  const dateYmd = dateParam ?? todayInBrazil();
  const dayStart = startOfDayBrazil(dateYmd);
  const dayEnd = endOfDayBrazil(dateYmd);
  const [ly, lm, ld] = dateYmd.split("-").map(Number);
  const labelDate = new Date(ly, lm - 1, ld, 12);

  const [professionals, tenant] = await Promise.all([
    prisma.professional.findMany({
      where: { tenantId: user.tenantId, active: true },
      include: {
        user: true,
        appointments: {
          where: { startAt: { gte: dayStart, lte: dayEnd }, status: { not: "CANCELLED" } },
          orderBy: { startAt: "asc" },
        },
        services: { where: { service: { active: true } }, include: { service: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.tenant.findUnique({ where: { id: user.tenantId } }),
  ]);

  const labels = getLabels(tenant!.businessType, tenant!.customLabels);

  const columns = professionals.map((p) => ({
    id: p.id,
    label: p.user.name,
    color: p.color,
    appointments: p.appointments.map((a) => ({
      id: a.id,
      patientName: a.patientName,
      startAt: a.startAt.toISOString(),
      endAt: a.endAt.toISOString(),
      status: a.status,
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

  return (
    <main className="flex-1 px-6 py-8 max-w-6xl mx-auto w-full" style={{ background: "var(--surface)" }}>
      <Link href="/dashboard" className="text-sm mb-4 inline-block" style={{ color: "var(--teal)" }}>
        ← Voltar para visão geral
      </Link>

      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="font-display text-3xl font-semibold" style={{ color: "var(--ink)" }}>
          Agenda geral
        </h1>
        <div className="flex items-center gap-2">
          <Link
            href={`/dashboard/calendar?date=${shiftYmd(dateYmd, -1)}`}
            className="px-3 py-2 rounded-lg text-sm"
            style={{ background: "var(--surface-card)", color: "var(--ink)", border: "1px solid var(--line)" }}
          >
            ← Anterior
          </Link>
          <DatePicker defaultValue={dateYmd} />
          <Link
            href={`/dashboard/calendar?date=${shiftYmd(dateYmd, 1)}`}
            className="px-3 py-2 rounded-lg text-sm"
            style={{ background: "var(--surface-card)", color: "var(--ink)", border: "1px solid var(--line)" }}
          >
            Próximo →
          </Link>
        </div>
      </div>

      <p className="text-sm mb-4 capitalize" style={{ color: "var(--ink-soft)" }}>
        {format(labelDate, "EEEE, dd/MM/yyyy", { locale: ptBR })}
      </p>

      {columns.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
          Nenhum {labels.professional.toLowerCase()} cadastrado ainda.
        </p>
      ) : (
        <GroupCalendarClient
          date={dateYmd}
          columns={columns}
          servicesByProfessional={servicesByProfessional}
          professionalLabel={labels.professional}
          patientLabel={labels.patient}
        />
      )}
    </main>
  );
}
