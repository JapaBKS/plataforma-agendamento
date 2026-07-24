import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth, canAccessProfessional } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const patchSchema = z.object({
  status: z.enum(["CANCELLED", "COMPLETED", "NO_SHOW", "CONFIRMED"]),
  reason: z.string().optional(),
});

/**
 * PATCH /api/appointments/[id]
 * Muda o status de um agendamento (cancelar, marcar como concluído/faltou/confirmado).
 * ADMIN pode alterar qualquer agendamento do seu tenant; PROFESSIONAL só os seus.
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

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados inválidos", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const updated = await prisma.appointment.update({
    where: { id },
    data: {
      status: parsed.data.status,
      ...(parsed.data.status === "CANCELLED"
        ? { cancelledAt: new Date(), cancelReason: parsed.data.reason }
        : {}),
    },
  });

  return NextResponse.json({ appointment: updated });
}
