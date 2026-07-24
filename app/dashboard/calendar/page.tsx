import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getLabels } from "@/lib/labels";
import { CalendarGrid } from "@/components/CalendarGrid";
import { startOfDay, endOfDay, addDays, subDays, format } from "date-fns";
import { DatePicker } from "./DatePicker";

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
  const date = dateParam ? new Date(`${dateParam}T00:00:00`) : new Date();
  const dayStart = startOfDay(date);
  const dayEnd = endOfDay(date);
  const dateValue = format(date, "yyyy-MM-dd");

  const [professionals, tenant] = await Promise.all([
    prisma.professional.findMany({
      where: { tenantId: user.tenantId, active: true },
      include: {
        user: true,
        appointments: {
          where: { startAt: { gte: dayStart, lte: dayEnd }, status: { not: "CANCELLED" } },
          orderBy: { startAt: "asc" },
        },
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
            href={`/dashboard/calendar?date=${format(subDays(date, 1), "yyyy-MM-dd")}`}
            className="px-3 py-2 rounded-lg text-sm"
            style={{ background: "var(--surface-card)", color: "var(--ink)", border: "1px solid var(--line)" }}
          >
            ← Anterior
          </Link>
          <DatePicker defaultValue={dateValue} />
          <Link
            href={`/dashboard/calendar?date=${format(addDays(date, 1), "yyyy-MM-dd")}`}
            className="px-3 py-2 rounded-lg text-sm"
            style={{ background: "var(--surface-card)", color: "var(--ink)", border: "1px solid var(--line)" }}
          >
            Próximo →
          </Link>
        </div>
      </div>

      <p className="text-sm mb-4" style={{ color: "var(--ink-soft)" }}>
        {format(date, "EEEE, dd/MM/yyyy")}
      </p>

      {columns.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
          Nenhum {labels.professional.toLowerCase()} cadastrado ainda.
        </p>
      ) : (
        <CalendarGrid date={date} columns={columns} />
      )}
    </main>
  );
}
