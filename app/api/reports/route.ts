import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { startOfMonth, endOfMonth } from "date-fns";

/**
 * GET /api/reports/revenue?month=2026-07
 * Faturamento por profissional no mês (considera só agendamentos CONCLUÍDOS -
 * cancelados não contam, e agendamentos futuros/agendados ainda não "faturaram").
 * Não é uma feature exclusiva de um tipo de negócio - fica disponível pra qualquer
 * tenant; é só mais útil pra quem vende serviço avulso do que pra quem usa convênio.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  const user = session?.user as any;
  if (!user || user.role !== "ADMIN" || !user.tenantId) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const monthParam = searchParams.get("month"); // "2026-07"
  const reference = monthParam ? new Date(`${monthParam}-01T00:00:00`) : new Date();
  if (isNaN(reference.getTime())) {
    return NextResponse.json({ error: "Mês inválido" }, { status: 400 });
  }

  const rangeStart = startOfMonth(reference);
  const rangeEnd = endOfMonth(reference);

  const appointments = await prisma.appointment.findMany({
    where: {
      tenantId: user.tenantId,
      status: "COMPLETED",
      startAt: { gte: rangeStart, lte: rangeEnd },
    },
    include: { professional: { include: { user: true } }, service: true },
  });

  const byProfessional = new Map<
    string,
    { professionalId: string; name: string; color: string; total: number; count: number }
  >();

  for (const a of appointments) {
    const key = a.professionalId;
    const entry = byProfessional.get(key) ?? {
      professionalId: key,
      name: a.professional.user.name,
      color: a.professional.color,
      total: 0,
      count: 0,
    };
    entry.total += a.price ?? 0;
    entry.count += 1;
    byProfessional.set(key, entry);
  }

  const results = Array.from(byProfessional.values()).sort((a, b) => b.total - a.total);
  const grandTotal = results.reduce((sum, r) => sum + r.total, 0);

  return NextResponse.json({
    month: monthParam ?? reference.toISOString().slice(0, 7),
    grandTotal,
    byProfessional: results,
  });
}
