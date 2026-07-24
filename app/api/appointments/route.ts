import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth, canAccessProfessional } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isStartTimeAvailable } from "@/lib/availability";

/**
 * GET /api/appointments?professionalId=xxx&from=...&to=...
 *
 * Toda consulta é OBRIGATORIAMENTE restrita ao tenant do usuário logado
 * (isolamento entre clientes da plataforma), e dentro do tenant:
 * - ADMIN sem professionalId -> retorna agendamentos de TODOS os profissionais do tenant
 * - ADMIN com professionalId  -> retorna agendamentos daquele profissional (se for do mesmo tenant)
 * - PROFESSIONAL              -> sempre retorna apenas os seus próprios
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const user = session.user as any;
  const { searchParams } = new URL(req.url);
  const requestedProfessionalId = searchParams.get("professionalId");
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  let professionalIdFilter: string | undefined;

  if (user.role === "PROFESSIONAL") {
    // Profissional só pode ver a própria agenda, independente do que for pedido
    professionalIdFilter = user.professionalId;
  } else if (requestedProfessionalId) {
    const professional = await prisma.professional.findFirst({
      where: { id: requestedProfessionalId, tenantId: user.tenantId },
    });
    if (!professional || !canAccessProfessional(user, professional.tenantId, requestedProfessionalId)) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }
    professionalIdFilter = requestedProfessionalId;
  }
  // ADMIN sem filtro -> undefined = todos os profissionais DO SEU TENANT

  const appointments = await prisma.appointment.findMany({
    where: {
      tenantId: user.tenantId, // isolamento: nunca vaza dado de outro tenant
      ...(professionalIdFilter ? { professionalId: professionalIdFilter } : {}),
      ...(from || to
        ? {
            startAt: {
              ...(from ? { gte: new Date(from) } : {}),
              ...(to ? { lte: new Date(to) } : {}),
            },
          }
        : {}),
    },
    include: { professional: { include: { user: true } } },
    orderBy: { startAt: "asc" },
  });

  return NextResponse.json({ appointments });
}

const createSchema = z.object({
  professionalId: z.string(),
  serviceId: z.string(),
  patientName: z.string().min(1),
  patientPhone: z.string().optional(),
  patientEmail: z.string().email().optional(),
  startAt: z.string().datetime(),
  notes: z.string().optional(),
});

/**
 * POST /api/appointments
 * Criação manual pelo dashboard - ADMIN pode criar para qualquer profissional do
 * seu tenant (é a secretária marcando um horário), PROFESSIONAL só para si mesmo.
 * A duração e o preço vêm sempre do serviço (com override do profissional se houver)
 * e o preço é gravado como "snapshot" no agendamento, não como referência viva.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  const user = session?.user as any;
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados inválidos", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { professionalId, serviceId, patientName, patientPhone, patientEmail, startAt, notes } = parsed.data;

  const professional = await prisma.professional.findUnique({ where: { id: professionalId } });
  if (!professional || !canAccessProfessional(user, professional.tenantId, professionalId)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
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

  const start = new Date(startAt);
  const end = new Date(start.getTime() + durationMin * 60000);

  const isFree = await isStartTimeAvailable(professionalId, start, durationMin, professional.tenantId);
  if (!isFree) {
    return NextResponse.json({ error: "Horário não disponível" }, { status: 409 });
  }

  const appointment = await prisma.appointment.create({
    data: {
      tenantId: professional.tenantId,
      professionalId,
      serviceId,
      patientName,
      patientPhone,
      patientEmail,
      startAt: start,
      endAt: end,
      price,
      source: "manual",
      notes,
      status: "SCHEDULED",
    },
  });

  return NextResponse.json({ appointment }, { status: 201 });
}
