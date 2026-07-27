import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth, canAccessProfessional } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkSlot } from "@/lib/availability";

/**
 * GET /api/appointments/[id]
 * Detalhes completos. O calendário carrega só o mínimo pra desenhar os blocos;
 * o resto é buscado quando alguém abre um agendamento específico.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const user = session?.user as any;
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;
  const appointment = await prisma.appointment.findUnique({
    where: { id },
    include: {
      professional: { include: { user: true } },
      service: true,
    },
  });
  if (!appointment) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  if (!canAccessProfessional(user, appointment.tenantId, appointment.professionalId)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  return NextResponse.json({
    appointment: {
      id: appointment.id,
      professionalId: appointment.professionalId,
      professionalName: appointment.professional.user.name,
      serviceId: appointment.serviceId,
      serviceName: appointment.service?.name ?? null,
      patientName: appointment.patientName,
      patientPhone: appointment.patientPhone,
      patientEmail: appointment.patientEmail,
      startAt: appointment.startAt.toISOString(),
      endAt: appointment.endAt.toISOString(),
      status: appointment.status,
      price: appointment.price,
      notes: appointment.notes,
      source: appointment.source,
    },
  });
}

const patchSchema = z.object({
  // --- Mudança de status ---
  status: z.enum(["SCHEDULED", "CONFIRMED", "CANCELLED", "COMPLETED", "NO_SHOW"]).optional(),
  reason: z.string().optional(),

  // --- Reagendamento (data/hora e/ou profissional) ---
  startAt: z.string().datetime().optional(),
  professionalId: z.string().optional(),

  // --- Edição de dados ---
  serviceId: z.string().optional(),
  patientName: z.string().min(1).optional(),
  patientPhone: z.string().optional().nullable(),
  patientEmail: z.string().email().optional().nullable().or(z.literal("")),
  notes: z.string().optional().nullable(),

  // Libera horário fora do expediente (nunca libera conflito)
  allowOutsideHours: z.boolean().optional(),
});

/**
 * PATCH /api/appointments/[id]
 *
 * Faz três coisas que antes exigiam cancelar e recriar:
 * - muda o status (confirmar, concluir, faltou, cancelar)
 * - reagenda (novo horário e/ou outro profissional)
 * - edita dados (serviço, cliente, observações)
 *
 * Quando horário, profissional ou serviço mudam, o novo encaixe é revalidado -
 * ignorando o próprio agendamento, senão ele conflitaria consigo mesmo.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const user = session?.user as any;
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;
  const appointment = await prisma.appointment.findUnique({ where: { id } });
  if (!appointment) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  if (!canAccessProfessional(user, appointment.tenantId, appointment.professionalId)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos", details: parsed.error.flatten() }, { status: 400 });
  }

  const body = parsed.data;
  const data: Record<string, unknown> = {};

  // ---------- Reagendamento / troca de profissional / troca de serviço ----------
  const movingTime = body.startAt !== undefined;
  const movingProfessional = body.professionalId !== undefined && body.professionalId !== appointment.professionalId;
  const changingService = body.serviceId !== undefined && body.serviceId !== appointment.serviceId;

  if (movingTime || movingProfessional || changingService) {
    const targetProfessionalId = body.professionalId ?? appointment.professionalId;

    // Se mudou de profissional, ele precisa ser do mesmo tenant e o usuário
    // precisa ter acesso a ele também (um profissional não move pra agenda de outro).
    if (movingProfessional) {
      const target = await prisma.professional.findFirst({
        where: { id: targetProfessionalId, tenantId: appointment.tenantId },
      });
      if (!target) {
        return NextResponse.json({ error: "Profissional não encontrado" }, { status: 404 });
      }
      if (!canAccessProfessional(user, appointment.tenantId, targetProfessionalId)) {
        return NextResponse.json({ error: "Sem permissão para essa agenda" }, { status: 403 });
      }
    }

    // A duração vem sempre do serviço (com override do profissional, se houver)
    const targetServiceId = body.serviceId ?? appointment.serviceId;
    let durationMin: number;
    let price = appointment.price;

    if (targetServiceId) {
      const link = await prisma.professionalService.findFirst({
        where: { professionalId: targetProfessionalId, serviceId: targetServiceId },
        include: { service: true },
      });
      if (!link) {
        return NextResponse.json(
          { error: "Esse profissional não realiza o serviço selecionado", issue: "not_offered" },
          { status: 409 }
        );
      }
      durationMin = link.durationMin ?? link.service.defaultDurationMin;
      // Trocar de serviço redefine o preço; só mover de horário mantém o preço combinado
      if (changingService || movingProfessional) {
        price = link.price ?? link.service.price;
      }
    } else {
      // Sem serviço vinculado: preserva a duração original
      durationMin = Math.round((appointment.endAt.getTime() - appointment.startAt.getTime()) / 60000);
    }

    const start = body.startAt ? new Date(body.startAt) : appointment.startAt;
    const check = await checkSlot(targetProfessionalId, start, durationMin, appointment.tenantId, id);

    if (!check.ok) {
      if (check.issue === "past") {
        return NextResponse.json(
          { error: "Não é possível reagendar para um horário que já passou.", issue: "past" },
          { status: 400 }
        );
      }
      if (check.issue === "conflict") {
        return NextResponse.json(
          { error: "Esse horário conflita com outro agendamento ou bloqueio.", issue: "conflict" },
          { status: 409 }
        );
      }
      if (check.issue === "outside_hours" && !body.allowOutsideHours) {
        return NextResponse.json(
          { error: "Horário fora do expediente cadastrado.", issue: "outside_hours" },
          { status: 409 }
        );
      }
    }

    data.professionalId = targetProfessionalId;
    data.serviceId = targetServiceId;
    data.startAt = start;
    data.endAt = new Date(start.getTime() + durationMin * 60000);
    data.price = price;
  }

  // ---------- Edição de dados do cliente ----------
  if (body.patientName !== undefined) data.patientName = body.patientName;
  if (body.patientPhone !== undefined) data.patientPhone = body.patientPhone || null;
  if (body.patientEmail !== undefined) data.patientEmail = body.patientEmail || null;
  if (body.notes !== undefined) data.notes = body.notes || null;

  // ---------- Status ----------
  if (body.status !== undefined) {
    data.status = body.status;
    if (body.status === "CANCELLED") {
      data.cancelledAt = new Date();
      data.cancelReason = body.reason ?? null;
    } else {
      // Reativar um cancelado limpa os campos de cancelamento
      data.cancelledAt = null;
      data.cancelReason = null;
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nada para atualizar" }, { status: 400 });
  }

  const updated = await prisma.appointment.update({ where: { id }, data });
  return NextResponse.json({ appointment: updated });
}

/**
 * DELETE /api/appointments/[id]
 *
 * Apaga de vez. Diferente de cancelar: cancelar PRESERVA o registro (importante
 * pro histórico e pra medir faltas/cancelamentos), enquanto excluir some com ele.
 * Use excluir só pra corrigir engano - por isso é restrito ao ADMIN.
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const user = session?.user as any;
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Apenas administradores podem excluir" }, { status: 403 });
  }

  const { id } = await params;
  const appointment = await prisma.appointment.findFirst({
    where: { id, tenantId: user.tenantId },
  });
  if (!appointment) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  await prisma.appointment.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
