import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const createSchema = z.object({
  name: z.string().min(1, "Nome obrigatório"),
  email: z.string().email("Email inválido"),
  password: z.string().min(6, "Mínimo de 6 caracteres"),
  specialty: z.string().optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default("#4F46E5"),
});

/** GET /api/professionals — lista os profissionais do tenant do usuário logado */
export async function GET() {
  const session = await auth();
  const user = session?.user as any;
  if (!user || user.role !== "ADMIN" || !user.tenantId) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const professionals = await prisma.professional.findMany({
    where: { tenantId: user.tenantId },
    include: { user: true },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ professionals });
}

/**
 * POST /api/professionals
 * Cria um novo profissional no tenant: o User (login) + o Professional (perfil de
 * agenda) juntos, com a grade de horário ainda vazia (o ADMIN configura depois em
 * /dashboard/[professionalId]/hours).
 */
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

  const { name, email, password, specialty, color } = parsed.data;

  const existing = await prisma.user.findUnique({
    where: { tenantId_email: { tenantId: user.tenantId, email } },
  });
  if (existing) {
    return NextResponse.json({ error: "Já existe um usuário com esse email nesse tenant" }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const newUser = await prisma.user.create({
    data: { tenantId: user.tenantId, name, email, passwordHash, role: "PROFESSIONAL" },
  });

  const professional = await prisma.professional.create({
    data: { tenantId: user.tenantId, userId: newUser.id, specialty, color },
    include: { user: true },
  });

  return NextResponse.json({ professional }, { status: 201 });
}
