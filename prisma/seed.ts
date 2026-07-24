import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function createTenant(opts: {
  name: string;
  slug: string;
  businessType: "BARBEARIA" | "CLINICA";
  plan?: "BASICO" | "PRO" | "ENTERPRISE";
  primaryColor: string;
  adminEmail: string;
  services: { name: string; defaultDurationMin: number; price?: number }[];
  professionals: {
    name: string;
    email: string;
    specialty: string;
    color: string;
    // nomes dos serviços (do array `services` acima) que esse profissional realiza;
    // durationMin opcional sobrescreve a duração padrão só pra ele
    services: { name: string; durationMin?: number }[];
  }[];
}) {
  const tenant = await prisma.tenant.upsert({
    where: { slug: opts.slug },
    update: {},
    create: {
      name: opts.name,
      slug: opts.slug,
      businessType: opts.businessType,
      plan: opts.plan ?? "BASICO",
      primaryColor: opts.primaryColor,
    },
  });

  // --- Admin/secretária do tenant ---
  const adminPassword = await bcrypt.hash("admin123", 10);
  await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: opts.adminEmail } },
    update: {},
    create: {
      tenantId: tenant.id,
      name: `Admin ${opts.name}`,
      email: opts.adminEmail,
      passwordHash: adminPassword,
      role: "ADMIN",
    },
  });

  // --- Catálogo de serviços do tenant ---
  const serviceByName: Record<string, { id: string }> = {};
  for (const s of opts.services) {
    let service = await prisma.service.findFirst({ where: { tenantId: tenant.id, name: s.name } });
    if (!service) {
      service = await prisma.service.create({
        data: { tenantId: tenant.id, name: s.name, defaultDurationMin: s.defaultDurationMin, price: s.price },
      });
    }
    serviceByName[s.name] = service;
  }

  // --- Profissionais do tenant ---
  for (const p of opts.professionals) {
    const password = await bcrypt.hash("profissional123", 10);
    const user = await prisma.user.upsert({
      where: { tenantId_email: { tenantId: tenant.id, email: p.email } },
      update: {},
      create: {
        tenantId: tenant.id,
        name: p.name,
        email: p.email,
        passwordHash: password,
        role: "PROFESSIONAL",
      },
    });

    const professional = await prisma.professional.upsert({
      where: { userId: user.id },
      update: {},
      create: {
        tenantId: tenant.id,
        userId: user.id,
        specialty: p.specialty,
        color: p.color,
      },
    });

    // Disponibilidade padrão: Seg-Sex, 08h-18h, sugerindo horários de 15 em 15min
    const existing = await prisma.availabilitySlot.findFirst({ where: { professionalId: professional.id } });
    if (!existing) {
      for (let weekday = 1; weekday <= 5; weekday++) {
        await prisma.availabilitySlot.create({
          data: {
            professionalId: professional.id,
            weekday,
            startTime: "08:00",
            endTime: "18:00",
            stepMinutes: 15,
          },
        });
      }
    }

    // Liga o profissional aos serviços que ele realiza (com duração própria, se houver)
    for (const svc of p.services) {
      const service = serviceByName[svc.name];
      if (!service) continue;
      await prisma.professionalService.upsert({
        where: { professionalId_serviceId: { professionalId: professional.id, serviceId: service.id } },
        update: {},
        create: { professionalId: professional.id, serviceId: service.id, durationMin: svc.durationMin },
      });
    }
  }

  // --- API Key exclusiva desse tenant para o N8N ---
  const rawKey = crypto.randomBytes(32).toString("hex");
  const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");
  await prisma.apiKey.create({
    data: { tenantId: tenant.id, name: `n8n-${opts.slug}`, keyHash },
  });

  return { tenant, rawKey };
}

async function main() {
  // --- Você, dono da plataforma - acessa /admin pelo domínio raiz (sem subdomínio) ---
  const existingSuperAdmin = await prisma.user.findFirst({
    where: { role: "SUPER_ADMIN", email: "voce@suaplataforma.com" },
  });
  if (!existingSuperAdmin) {
    const superAdminPassword = await bcrypt.hash("superadmin123", 10);
    await prisma.user.create({
      data: {
        tenantId: null,
        name: "Dono da Plataforma",
        email: "voce@suaplataforma.com",
        passwordHash: superAdminPassword,
        role: "SUPER_ADMIN",
      },
    });
  }

  const clinica = await createTenant({
    name: "Clínica Saúde Total",
    slug: "clinica-saude-total",
    businessType: "CLINICA",
    plan: "PRO",
    primaryColor: "#1F6F63",
    adminEmail: "secretaria@saudetotal.com",
    services: [
      { name: "Consulta de retorno", defaultDurationMin: 30, price: 150 },
      { name: "Avaliação inicial", defaultDurationMin: 60, price: 280 },
    ],
    professionals: [
      {
        name: "Dra. Ana Souza",
        email: "ana@saudetotal.com",
        specialty: "Cardiologia",
        color: "#1F6F63",
        services: [{ name: "Consulta de retorno" }, { name: "Avaliação inicial" }],
      },
      {
        name: "Dr. Bruno Lima",
        email: "bruno@saudetotal.com",
        specialty: "Ortopedia",
        color: "#3D5359",
        // Com o Bruno, a avaliação inicial leva 45min em vez dos 60min padrão do catálogo
        services: [{ name: "Consulta de retorno" }, { name: "Avaliação inicial", durationMin: 45 }],
      },
    ],
  });

  const barbearia = await createTenant({
    name: "Barbearia do Zé",
    slug: "barbearia-do-ze",
    businessType: "BARBEARIA",
    primaryColor: "#E0793C",
    adminEmail: "recepcao@barbeariadoze.com",
    services: [
      { name: "Corte", defaultDurationMin: 30, price: 40 },
      { name: "Corte + barba", defaultDurationMin: 60, price: 70 },
    ],
    professionals: [
      {
        name: "Zé Carlos",
        email: "ze@barbeariadoze.com",
        specialty: "Corte e barba",
        color: "#E0793C",
        services: [{ name: "Corte" }, { name: "Corte + barba" }],
      },
      {
        name: "Marquinhos",
        email: "marquinhos@barbeariadoze.com",
        specialty: "Corte navalhado",
        color: "#8FB6A8",
        // Marquinhos só faz corte simples, não faz corte+barba
        services: [{ name: "Corte" }],
      },
    ],
  });

  console.log("\n=== Seed concluído: 2 tenants isolados criados ===\n");

  console.log("--- Você (dono da plataforma) ---");
  console.log("Acesse pelo domínio raiz, sem subdomínio, ex: http://localhost:3000/login");
  console.log("Login: voce@suaplataforma.com / superadmin123");
  console.log("(depois de logar, vá em /admin para gerenciar os clientes)");

  console.log(`--- ${clinica.tenant.name} (${clinica.tenant.slug}) ---`);
  console.log("Admin: secretaria@saudetotal.com / admin123");
  console.log("Profissional: ana@saudetotal.com / profissional123");
  console.log("Profissional: bruno@saudetotal.com / profissional123");
  console.log("API key N8N:", clinica.rawKey);

  console.log(`\n--- ${barbearia.tenant.name} (${barbearia.tenant.slug}) ---`);
  console.log("Admin: recepcao@barbeariadoze.com / admin123");
  console.log("Profissional: ze@barbeariadoze.com / profissional123");
  console.log("Profissional: marquinhos@barbeariadoze.com / profissional123");
  console.log("API key N8N:", barbearia.rawKey);

  console.log("\n>>> Guarde as API keys acima - elas só aparecem uma vez!");
  console.log("=======================\n");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
