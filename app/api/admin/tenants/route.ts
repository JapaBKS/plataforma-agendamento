import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const createTenantSchema = z.object({
  name: z.string().min(1, "Nome obrigatório"),
  slug: z
    .string()
    .min(2, "Mínimo de 2 caracteres")
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use só letras minúsculas, números e hífen (ex: barbearia-do-ze)"),
  businessType: z.enum(["CLINICA", "BARBEARIA", "ESTETICA", "OUTRO"]),
  plan: z.enum(["BASICO", "PRO", "ENTERPRISE"]).default("BASICO"),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Cor inválida"),
  adminName: z.string().min(1, "Nome do admin obrigatório"),
  adminEmail: z.string().email("Email inválido"),
  adminPassword: z.string().min(6, "Mínimo de 6 caracteres"),
});

/**
 * POST /api/admin/tenants
 * Exclusivo do SUPER_ADMIN (dono da plataforma). Cria:
 * - o Tenant (o novo cliente/negócio)
 * - o usuário ADMIN inicial dele (login que a secretária/dono do negócio vai usar)
 * - uma ApiKey pronta pro N8N
 *
 * Retorna a senha do admin (que o próprio SUPER_ADMIN acabou de definir) e a
 * API key gerada, pra repassar ao cliente novo - a API key não é recuperável depois.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  const user = session?.user as any;

  if (!user || user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = createTenantSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados inválidos", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { name, slug, businessType, plan, primaryColor, adminName, adminEmail, adminPassword } =
    parsed.data;

  const existing = await prisma.tenant.findUnique({ where: { slug } });
  if (existing) {
    return NextResponse.json(
      { error: `Já existe um tenant com o subdomínio "${slug}"` },
      { status: 409 }
    );
  }

  const tenant = await prisma.tenant.create({
    data: { name, slug, businessType, plan, primaryColor },
  });

  const passwordHash = await bcrypt.hash(adminPassword, 10);
  await prisma.user.create({
    data: {
      tenantId: tenant.id,
      name: adminName,
      email: adminEmail,
      passwordHash,
      role: "ADMIN",
    },
  });

  const rawKey = crypto.randomBytes(32).toString("hex");
  const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");
  await prisma.apiKey.create({
    data: { tenantId: tenant.id, name: `n8n-${slug}`, keyHash },
  });

  return NextResponse.json({
    tenant,
    apiKey: rawKey, // só retornada aqui, uma vez - não fica salva em texto puro
  });
}

/** GET /api/admin/tenants — lista todos os tenants, exclusivo do SUPER_ADMIN */
export async function GET() {
  const session = await auth();
  const user = session?.user as any;

  if (!user || user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const tenants = await prisma.tenant.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { users: true, professionals: true, appointments: true } } },
  });

  return NextResponse.json({ tenants });
}
