import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getLabels } from "@/lib/labels";
import { ServicesManager } from "./ServicesManager";

export default async function ServicesPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const user = session.user as any;
  if (user.role !== "ADMIN") redirect("/dashboard");

  const [services, professionals, tenant] = await Promise.all([
    prisma.service.findMany({
      where: { tenantId: user.tenantId },
      include: { professionals: { include: { professional: { include: { user: true } } } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.professional.findMany({
      where: { tenantId: user.tenantId, active: true },
      include: { user: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.tenant.findUnique({ where: { id: user.tenantId } }),
  ]);

  const labels = getLabels(tenant!.businessType, tenant!.customLabels);

  return (
    <main className="flex-1 px-6 py-8 max-w-4xl mx-auto w-full" style={{ background: "var(--surface)" }}>
      <Link href="/dashboard" className="text-sm mb-4 inline-block" style={{ color: "var(--teal)" }}>
        ← Voltar para visão geral
      </Link>
      <h1 className="font-display text-3xl font-semibold mb-1" style={{ color: "var(--ink)" }}>
        Serviços
      </h1>
      <p className="text-sm mb-8" style={{ color: "var(--ink-soft)" }}>
        Cada serviço tem sua própria duração — isso é o que o sistema usa pra calcular horários
        disponíveis, tanto no dashboard quanto nas automações do N8N.
      </p>

      <ServicesManager
        initialServices={JSON.parse(JSON.stringify(services))}
        professionals={JSON.parse(JSON.stringify(professionals))}
        professionalLabel={labels.professional}
      />
    </main>
  );
}
