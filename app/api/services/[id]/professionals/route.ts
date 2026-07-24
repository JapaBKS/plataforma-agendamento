import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const linkSchema = z.object({
  professionalId: z.string(),
  durationMin: z.number().int().positive().nullable().optional(),
  price: z.number().nonnegative().nullable().optional(),
});

/**
 * POST /api/services/[id]/professionals
 * Vincula (ou atualiza o vínculo de) um profissional a esse serviço.
 * Se durationMin/price vierem nulos, o profissional usa o padrão do catálogo.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const user = session?.user as any;
  if (!user || user.role !== "ADMIN" || !user.tenantId) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id: serviceId } = await params;
  const service = await prisma.service.findFirst({ where: { id: serviceId, tenantId: user.tenantId } });
  if (!service) {
    return NextResponse.json({ error: "Serviço não encontrado" }, { status: 404 });
  }

  const body = await req.json();
  const parsed = linkSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados inválidos", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { professionalId, durationMin, price } = parsed.data;
  const professional = await prisma.professional.findFirst({
    where: { id: professionalId, tenantId: user.tenantId },
  });
  if (!professional) {
    return NextResponse.json({ error: "Profissional não encontrado" }, { status: 404 });
  }

  const link = await prisma.professionalService.upsert({
    where: { professionalId_serviceId: { professionalId, serviceId } },
    update: { durationMin: durationMin ?? null, price: price ?? null },
    create: { professionalId, serviceId, durationMin: durationMin ?? null, price: price ?? null },
  });

  return NextResponse.json({ link });
}

/** DELETE /api/services/[id]/professionals?professionalId=xxx — desvincula o profissional desse serviço */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const user = session?.user as any;
  if (!user || user.role !== "ADMIN" || !user.tenantId) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id: serviceId } = await params;
  const service = await prisma.service.findFirst({ where: { id: serviceId, tenantId: user.tenantId } });
  if (!service) {
    return NextResponse.json({ error: "Serviço não encontrado" }, { status: 404 });
  }

  const professionalId = req.nextUrl.searchParams.get("professionalId");
  if (!professionalId) {
    return NextResponse.json({ error: "Parâmetro 'professionalId' é obrigatório" }, { status: 400 });
  }

  await prisma.professionalService.deleteMany({ where: { serviceId, professionalId } });
  return NextResponse.json({ ok: true });
}
