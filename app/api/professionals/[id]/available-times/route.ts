import { NextRequest, NextResponse } from "next/server";
import { auth, canAccessProfessional } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAvailableStartTimes } from "@/lib/availability";
import { brazilWallClockToUtc } from "@/lib/timezone";

/**
 * GET /api/professionals/[id]/available-times?serviceId=xxx&date=2026-07-25
 * Uso interno do dashboard (autenticado por sessão) - mesma lógica que a rota
 * do N8N, mas checando permissão de sessão em vez de API key.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const user = session?.user as any;
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id: professionalId } = await params;
  const professional = await prisma.professional.findUnique({ where: { id: professionalId } });
  if (!professional) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  if (!canAccessProfessional(user, professional.tenantId, professionalId)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const serviceId = searchParams.get("serviceId");
  const dateParam = searchParams.get("date");
  if (!serviceId || !dateParam) {
    return NextResponse.json({ error: "Parâmetros 'serviceId' e 'date' são obrigatórios" }, { status: 400 });
  }

  // "2026-07-27" significa o dia 27 no Brasil; usamos meio-dia pra representar
  // o dia com folga em qualquer fuso, e o motor extrai a data brasileira dali.
  const date = brazilWallClockToUtc(dateParam, 12, 0);
  if (isNaN(date.getTime())) {
    return NextResponse.json({ error: "Data inválida" }, { status: 400 });
  }

  const link = await prisma.professionalService.findFirst({
    where: { professionalId, serviceId },
    include: { service: true },
  });
  if (!link) {
    return NextResponse.json({ error: "Esse profissional não realiza esse serviço" }, { status: 404 });
  }
  const durationMin = link.durationMin ?? link.service.defaultDurationMin;
  const price = link.price ?? link.service.price;

  const starts = await getAvailableStartTimes(professionalId, date, durationMin, professional.tenantId);

  return NextResponse.json({
    durationMin,
    price,
    availableStartTimes: starts.map((s) => s.toISOString()),
  });
}
