import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { auth, canAccessProfessional } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getLabels } from "@/lib/labels";
import { startOfDay, endOfDay, addDays, subDays, format } from "date-fns";
import { DatePicker } from "../../calendar/DatePicker";
import { ProfessionalCalendarClient } from "./ProfessionalCalendarClient";

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

  const { date: dateParam } = await searchParams;
  const date = dateParam ? new Date(`${dateParam}T00:00:00`) : new Date();
  const dayStart = startOfDay(date);
  const dayEnd = endOfDay(date);
  const dateValue = format(date, "yyyy-MM-dd");

  const [appointments, professionalServices, availability] = await Promise.all([
    prisma.appointment.findMany({
      where: { professionalId, startAt: { gte: dayStart, lte: dayEnd }, status: { not: "CANCELLED" } },
      orderBy: { startAt: "asc" },
    }),
    prisma.professionalService.findMany({
      where: { professionalId, service: { active: true } },
      include: { service: true },
    }),
    // Grade de trabalho do dia da semana correspondente
    prisma.availabilitySlot.findMany({
      where: { professionalId, weekday: date.getDay() },
    }),
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
            href={`/dashboard/${professionalId}/calendar?date=${format(subDays(date, 1), "yyyy-MM-dd")}`}
            className="px-3 py-2 rounded-lg text-sm"
            style={{ background: "var(--surface-card)", color: "var(--ink)", border: "1px solid var(--line)" }}
          >
            ← Anterior
          </Link>
          <DatePicker defaultValue={dateValue} />
          <Link
            href={`/dashboard/${professionalId}/calendar?date=${format(addDays(date, 1), "yyyy-MM-dd")}`}
            className="px-3 py-2 rounded-lg text-sm"
            style={{ background: "var(--surface-card)", color: "var(--ink)", border: "1px solid var(--line)" }}
          >
            Próximo →
          </Link>
        </div>
      </div>

      <p className="text-sm mb-4" style={{ color: "var(--ink-soft)" }}>
        {format(date, "dd/MM/yyyy")}
        {workingRanges.length === 0 && " · sem expediente cadastrado neste dia"}
      </p>

      <ProfessionalCalendarClient
        date={date.toISOString()}
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
