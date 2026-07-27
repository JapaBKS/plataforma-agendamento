import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { auth, canAccessProfessional } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getLabels } from "@/lib/labels";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { DatePicker } from "../../calendar/DatePicker";
import { ProfessionalCalendarClient } from "./ProfessionalCalendarClient";
import { todayInBrazil, startOfDayBrazil, endOfDayBrazil, dateToYmdBrazil } from "@/lib/timezone";

/** Soma/subtrai dias de uma data "yyyy-MM-dd" sem passar por fuso. */
function shiftYmd(ymd: string, deltaDays: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y, m - 1, d + deltaDays, 12); // meio-dia: seguro
  return format(dt, "yyyy-MM-dd");
}

export default async function ProfessionalCalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ professionalId: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const user = session.user as any;
  const { professionalId } = await params;

  const professional = await prisma.professional.findUnique({
    where: { id: professionalId },
    include: { user: true, tenant: true },
  });
  if (!professional) notFound();

  if (!canAccessProfessional(user, professional.tenantId, professionalId)) {
    redirect("/dashboard");
  }

  const labels = getLabels(professional.tenant.businessType, professional.tenant.customLabels);

  // Data trabalhada como "yyyy-MM-dd" (sem fuso); limites do dia calculados no Brasil.
  const { date: dateParam } = await searchParams;
  const dateYmd = dateParam ?? todayInBrazil();
  const dayStart = startOfDayBrazil(dateYmd);
  const dayEnd = endOfDayBrazil(dateYmd);

  // Data ao meio-dia só pra formatar rótulos e descobrir o dia da semana
  const [dy, dm, dd] = dateYmd.split("-").map(Number);
  const labelDate = new Date(dy, dm - 1, dd, 12);
  const weekday = labelDate.getDay();

  const [appointments, professionalServices, availability] = await Promise.all([
    prisma.appointment.findMany({
      where: { professionalId, startAt: { gte: dayStart, lte: dayEnd }, status: { not: "CANCELLED" } },
      orderBy: { startAt: "asc" },
    }),
    prisma.professionalService.findMany({
      where: { professionalId, service: { active: true } },
      include: { service: true },
    }),
    prisma.availabilitySlot.findMany({ where: { professionalId, weekday } }),
  ]);

  const workingRanges = availability.map((slot) => ({ start: slot.startTime, end: slot.endTime }));

  const columns = [
    {
      id: professional.id,
      label: professional.user.name,
      color: professional.color,
      workingRanges,
      appointments: appointments.map((a) => ({
        id: a.id,
        patientName: a.patientName,
        startAt: a.startAt.toISOString(),
        endAt: a.endAt.toISOString(),
        status: a.status,
      })),
    },
  ];

  const services = professionalServices.map((link) => ({
    serviceId: link.service.id,
    name: link.service.name,
    durationMin: link.durationMin ?? link.service.defaultDurationMin,
    price: link.price ?? link.service.price,
  }));

  const prevDay = shiftYmd(dateYmd, -1);
  const nextDay = shiftYmd(dateYmd, 1);

  return (
    <main className="flex-1 px-6 py-8 max-w-3xl mx-auto w-full" style={{ background: "var(--surface)" }}>
      <Link href={`/dashboard/${professionalId}`} className="text-sm mb-4 inline-block" style={{ color: "var(--teal)" }}>
        ← Voltar para a agenda
      </Link>

      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="font-display text-3xl font-semibold" style={{ color: "var(--ink)" }}>
          {professional.user.name}
        </h1>
        <div className="flex items-center gap-2">
          <Link
            href={`/dashboard/${professionalId}/calendar?date=${prevDay}`}
            className="px-3 py-2 rounded-lg text-sm"
            style={{ background: "var(--surface-card)", color: "var(--ink)", border: "1px solid var(--line)" }}
          >
            ← Anterior
          </Link>
          <DatePicker defaultValue={dateYmd} />
          <Link
            href={`/dashboard/${professionalId}/calendar?date=${nextDay}`}
            className="px-3 py-2 rounded-lg text-sm"
            style={{ background: "var(--surface-card)", color: "var(--ink)", border: "1px solid var(--line)" }}
          >
            Próximo →
          </Link>
        </div>
      </div>

      <p className="text-sm mb-4 capitalize" style={{ color: "var(--ink-soft)" }}>
        {format(labelDate, "EEEE, dd/MM/yyyy", { locale: ptBR })}
        {workingRanges.length === 0 && " · sem expediente cadastrado neste dia"}
      </p>

      <ProfessionalCalendarClient
        date={dateYmd}
        professionalId={professionalId}
        professionalLabel={professional.user.name}
        columns={columns}
        services={services}
        workingRanges={workingRanges}
        patientLabel={labels.patient}
      />
    </main>
  );
}
