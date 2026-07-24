import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth, canAccessProfessional } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function checkAccess(professionalId: string) {
  const session = await auth();
  const user = session?.user as any;
  if (!user) return { ok: false as const, status: 401 };

  const professional = await prisma.professional.findUnique({ where: { id: professionalId } });
  if (!professional) return { ok: false as const, status: 404 };

  if (!canAccessProfessional(user, professional.tenantId, professionalId)) {
    return { ok: false as const, status: 403 };
  }
  return { ok: true as const, professional };
}

/** GET /api/professionals/[id]/availability — lista o horário de funcionamento atual */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await checkAccess(id);
  if (!access.ok) return NextResponse.json({ error: "Sem permissão" }, { status: access.status });

  const slots = await prisma.availabilitySlot.findMany({
    where: { professionalId: id },
    orderBy: { weekday: "asc" },
  });

  return NextResponse.json({ slots });
}

const daySchema = z.object({
  weekday: z.number().int().min(0).max(6),
  closed: z.boolean(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  stepMinutes: z.number().int().positive().optional(),
});

const updateSchema = z.object({ days: z.array(daySchema).length(7) });

/**
 * PUT /api/professionals/[id]/availability
 * Substitui o horário de funcionamento inteiro (um período por dia da semana).
 * Body: { days: [{ weekday: 0, closed: true }, { weekday: 1, closed: false, startTime: "08:00", endTime: "18:00", stepMinutes: 15 }, ...] }
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await checkAccess(id);
  if (!access.ok) return NextResponse.json({ error: "Sem permissão" }, { status: access.status });

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados inválidos", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const openDays = parsed.data.days.filter((d) => !d.closed);
  for (const d of openDays) {
    if (!d.startTime || !d.endTime) {
      return NextResponse.json(
        { error: `Dia ${d.weekday}: informe horário de início e fim, ou marque como fechado` },
        { status: 400 }
      );
    }
  }

  await prisma.$transaction([
    prisma.availabilitySlot.deleteMany({ where: { professionalId: id } }),
    prisma.availabilitySlot.createMany({
      data: openDays.map((d) => ({
        professionalId: id,
        weekday: d.weekday,
        startTime: d.startTime!,
        endTime: d.endTime!,
        stepMinutes: d.stepMinutes ?? 15,
      })),
    }),
  ]);

  const slots = await prisma.availabilitySlot.findMany({
    where: { professionalId: id },
    orderBy: { weekday: "asc" },
  });
  return NextResponse.json({ slots });
}
