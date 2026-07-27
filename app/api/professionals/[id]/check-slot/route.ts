import { NextRequest, NextResponse } from "next/server";
import { auth, canAccessProfessional } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkSlot } from "@/lib/availability";

/**
 * GET /api/professionals/[id]/check-slot?serviceId=xxx&startAt=ISO
 *
 * Diz na hora se aquele profissional pode atender naquele horário, e QUAL o
 * problema se não puder. Serve pra avisar a recepção ANTES de ela digitar os
 * dados do cliente, em vez de recusar só no envio.
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
  const startAt = searchParams.get("startAt");
  if (!serviceId || !startAt) {
    return NextResponse.json({ error: "Parâmetros 'serviceId' e 'startAt' são obrigatórios" }, { status: 400 });
  }

  const start = new Date(startAt);
  if (isNaN(start.getTime())) {
    return NextResponse.json({ error: "Data inválida" }, { status: 400 });
  }

  const link = await prisma.professionalService.findFirst({
    where: { professionalId, serviceId },
    include: { service: true },
  });
  if (!link) {
    return NextResponse.json({ ok: false, issue: "not_offered" });
  }

  const durationMin = link.durationMin ?? link.service.defaultDurationMin;
  const result = await checkSlot(professionalId, start, durationMin, professional.tenantId);

  return NextResponse.json({ ...result, durationMin });
}
