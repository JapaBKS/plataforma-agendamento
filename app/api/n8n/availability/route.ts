import { NextRequest, NextResponse } from "next/server";
import { getTenantFromApiKey } from "@/lib/apiKeyAuth";
import { getAvailableStartTimes } from "@/lib/availability";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/n8n/availability?professionalId=xxx&serviceId=yyy&date=2026-07-25
 * Header obrigatório: x-api-key
 *
 * Retorna os horários de INÍCIO possíveis pra aquele serviço específico -
 * a duração já vem embutida (do Service, com override por profissional se houver),
 * então o N8N não precisa calcular nada, só oferecer as opções que voltam aqui.
 */
export async function GET(req: NextRequest) {
  const tenantId = await getTenantFromApiKey(req);
  if (!tenantId) {
    return NextResponse.json({ error: "API key inválida" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const professionalId = searchParams.get("professionalId");
  const serviceId = searchParams.get("serviceId");
  const dateParam = searchParams.get("date"); // formato YYYY-MM-DD

  if (!professionalId || !serviceId || !dateParam) {
    return NextResponse.json(
      { error: "Parâmetros 'professionalId', 'serviceId' e 'date' são obrigatórios" },
      { status: 400 }
    );
  }

  const date = new Date(`${dateParam}T00:00:00`);
  if (isNaN(date.getTime())) {
    return NextResponse.json({ error: "Data inválida" }, { status: 400 });
  }

  // Resolve a duração: override do profissional para esse serviço, senão o padrão do serviço
  const link = await prisma.professionalService.findFirst({
    where: { professionalId, serviceId, service: { tenantId } },
    include: { service: true },
  });
  if (!link) {
    return NextResponse.json(
      { error: "Esse profissional não realiza esse serviço (ou o serviço não existe nesse tenant)" },
      { status: 404 }
    );
  }
  const durationMin = link.durationMin ?? link.service.defaultDurationMin;

  const starts = await getAvailableStartTimes(professionalId, date, durationMin, tenantId);

  return NextResponse.json({
    professionalId,
    serviceId,
    date: dateParam,
    durationMin,
    availableStartTimes: starts.map((s) => s.toISOString()),
  });
}
