import { NextRequest, NextResponse } from "next/server";
import { getTenantFromApiKey } from "@/lib/apiKeyAuth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/n8n/services?professionalId=xxx
 * Header obrigatório: x-api-key
 *
 * Lista os serviços que aquele profissional realiza, com duração/preço já
 * resolvidos (usando o override do profissional quando houver, senão o padrão
 * do catálogo). Use isso pra oferecer as opções antes de consultar disponibilidade.
 */
export async function GET(req: NextRequest) {
  const tenantId = await getTenantFromApiKey(req);
  if (!tenantId) {
    return NextResponse.json({ error: "API key inválida" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const professionalId = searchParams.get("professionalId");
  if (!professionalId) {
    return NextResponse.json({ error: "Parâmetro 'professionalId' é obrigatório" }, { status: 400 });
  }

  const links = await prisma.professionalService.findMany({
    where: { professionalId, service: { tenantId, active: true } },
    include: { service: true },
  });

  const services = links.map((link) => ({
    serviceId: link.service.id,
    name: link.service.name,
    durationMin: link.durationMin ?? link.service.defaultDurationMin,
    price: link.price ?? link.service.price,
  }));

  return NextResponse.json({ professionalId, services });
}
