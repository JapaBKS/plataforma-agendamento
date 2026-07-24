import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const updateSchema = z.object({
  specialty: z.string().optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  active: z.boolean().optional(),
});

/**
 * PATCH /api/professionals/[id]
 * Edita especialidade/cor, ou ativa/desativa (desativar NÃO apaga o histórico de
 * agendamentos - só some da lista de "quem trabalha aqui" pra novos agendamentos).
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const user = session?.user as any;
  if (!user || user.role !== "ADMIN" || !user.tenantId) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id } = await params;
  const existing = await prisma.professional.findFirst({ where: { id, tenantId: user.tenantId } });
  if (!existing) {
    return NextResponse.json({ error: "Profissional não encontrado" }, { status: 404 });
  }

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados inválidos", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const professional = await prisma.professional.update({
    where: { id },
    data: parsed.data,
    include: { user: true },
  });

  return NextResponse.json({ professional });
}
