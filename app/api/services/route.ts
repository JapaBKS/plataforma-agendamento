import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const createSchema = z.object({
  name: z.string().min(1, "Nome obrigatório"),
  defaultDurationMin: z.number().int().positive("Duração deve ser maior que zero"),
  price: z.number().nonnegative().optional().nullable(),
});

/** GET /api/services — lista os serviços do tenant do usuário logado, com os profissionais vinculados */
export async function GET() {
  const session = await auth();
  const user = session?.user as any;
  if (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") || !user.tenantId) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const services = await prisma.service.findMany({
    where: { tenantId: user.tenantId },
    include: { professionals: { include: { professional: { include: { user: true } } } } },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ services });
}

/** POST /api/services — cria um novo serviço no catálogo do tenant */
export async function POST(req: NextRequest) {
  const session = await auth();
  const user = session?.user as any;
  if (!user || user.role !== "ADMIN" || !user.tenantId) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados inválidos", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const service = await prisma.service.create({
    data: {
      tenantId: user.tenantId,
      name: parsed.data.name,
      defaultDurationMin: parsed.data.defaultDurationMin,
      price: parsed.data.price ?? null,
    },
  });

  return NextResponse.json({ service }, { status: 201 });
}
