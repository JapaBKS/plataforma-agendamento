import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getTenantFromApiKey } from "@/lib/apiKeyAuth";
import { prisma } from "@/lib/prisma";
import { isStartTimeAvailable } from "@/lib/availability";

const createSchema = z.object({
  professionalId: z.string(),
  serviceId: z.string(),
  patientName: z.string().min(1),
  patientPhone: z.string().optional(),
  patientEmail: z.string().email().optional(),
  startAt: z.string().datetime(), // ISO string - use um valor retornado por /api/n8n/availability
  externalRef: z.string().optional(), // ex: id da conversa no WhatsApp
  notes: z.string().optional(),
  customFields: z.record(z.string(), z.any()).optional(),
});

/**
 * POST /api/n8n/appointments
 * Header obrigatório: x-api-key (identifica o tenant automaticamente)
 * Cria um agendamento. A duração vem do `serviceId` (nunca do que o N8N informar
 * livremente) - isso evita agendamentos com duração errada por engano do fluxo.
 * Use um `startAt` retornado por GET /api/n8n/availability.
 */
export async function POST(req: NextRequest) {
  const tenantId = await getTenantFromApiKey(req);
  if (!tenantId) {
    return NextResponse.json({ error: "API key inválida" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload inválido", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { professionalId, serviceId, patientName, patientPhone, patientEmail, startAt, externalRef, notes, customFields } =
    parsed.data;

  // Garante que o profissional pertence ao MESMO tenant da API key usada
  const professional = await prisma.professional.findFirst({
    where: { id: professionalId, tenantId },
  });
  if (!professional) {
    return NextResponse.json(
      { error: "Profissional não encontrado para este tenant" },
      { status: 404 }
    );
  }

  // Resolve a duração real: override do profissional para esse serviço, senão o padrão do serviço
  const link = await prisma.professionalService.findFirst({
    where: { professionalId, serviceId, service: { tenantId } },
    include: { service: true },
  });
  if (!link) {
    return NextResponse.json(
      { error: "Esse profissional não realiza esse serviço" },
      { status: 404 }
    );
  }
  const durationMin = link.durationMin ?? link.service.defaultDurationMin;
  const price = link.price ?? link.service.price;

  const start = new Date(startAt);
  const end = new Date(start.getTime() + durationMin * 60000);

  // Não permite agendar para trás. A tela do calendário já bloqueia o clique,
  // mas a validação de verdade tem que estar aqui - a API é chamada direto
  // pelo N8N e por qualquer requisição.
  //
  // TOLERANCIA_MIN existe pro caso de "encaixe" na recepção: o cliente chegou
  // 14:00, já são 14:05 e a secretária quer registrar. Aumente esse número se
  // quiser dar mais folga, ou zere pra proibir estritamente.
  const TOLERANCIA_MIN = 5;
  if (start.getTime() < Date.now() - TOLERANCIA_MIN * 60_000) {
    return NextResponse.json(
      { error: "Não é possível agendar em um horário que já passou." },
      { status: 400 }
    );
  }

  // Revalida disponibilidade no momento da criação para evitar conflitos de horário
  const isFree = await isStartTimeAvailable(professionalId, start, durationMin, tenantId);
  if (!isFree) {
    return NextResponse.json(
      { error: "Horário não disponível. Consulte /api/n8n/availability novamente." },
      { status: 409 }
    );
  }

  const appointment = await prisma.appointment.create({
    data: {
      tenantId,
      professionalId,
      serviceId,
      patientName,
      patientPhone,
      patientEmail,
      startAt: start,
      endAt: end,
      price,
      source: "n8n",
      externalRef,
      notes,
      customFields,
      status: "SCHEDULED",
    },
  });

  return NextResponse.json({ appointment }, { status: 201 });
}

const cancelSchema = z.object({
  appointmentId: z.string().optional(),
  externalRef: z.string().optional(), // permite cancelar buscando pelo id externo (ex: id da conversa)
  reason: z.string().optional(),
});

/**
 * PATCH /api/n8n/appointments
 * Header obrigatório: x-api-key
 * Cancela um agendamento existente (por appointmentId OU externalRef), sempre
 * restrito ao tenant da API key usada.
 */
export async function PATCH(req: NextRequest) {
  const tenantId = await getTenantFromApiKey(req);
  if (!tenantId) {
    return NextResponse.json({ error: "API key inválida" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = cancelSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload inválido", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { appointmentId, externalRef, reason } = parsed.data;
  if (!appointmentId && !externalRef) {
    return NextResponse.json(
      { error: "Informe 'appointmentId' ou 'externalRef'" },
      { status: 400 }
    );
  }

  const appointment = await prisma.appointment.findFirst({
    where: {
      tenantId,
      ...(appointmentId ? { id: appointmentId } : { externalRef }),
    },
  });

  if (!appointment) {
    return NextResponse.json({ error: "Agendamento não encontrado" }, { status: 404 });
  }

  const updated = await prisma.appointment.update({
    where: { id: appointment.id },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
      cancelReason: reason,
    },
  });

  return NextResponse.json({ appointment: updated });
}
