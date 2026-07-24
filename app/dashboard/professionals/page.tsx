import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getLabels } from "@/lib/labels";
import { ProfessionalsManager } from "./ProfessionalsManager";

export default async function ProfessionalsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const user = session.user as any;
  if (user.role !== "ADMIN") redirect("/dashboard");

  const [professionals, tenant] = await Promise.all([
    prisma.professional.findMany({
      where: { tenantId: user.tenantId },
      include: { user: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.tenant.findUnique({ where: { id: user.tenantId } }),
  ]);

  const labels = getLabels(tenant!.businessType, tenant!.customLabels);

  return (
    <main className="flex-1 px-6 py-8 max-w-3xl mx-auto w-full" style={{ background: "var(--surface)" }}>
      <Link href="/dashboard" className="text-sm mb-4 inline-block" style={{ color: "var(--teal)" }}>
        ← Voltar para visão geral
      </Link>
      <h1 className="font-display text-3xl font-semibold mb-1" style={{ color: "var(--ink)" }}>
        {labels.professionalPlural}
      </h1>
      <p className="text-sm mb-8" style={{ color: "var(--ink-soft)" }}>
        Depois de criar, configure o horário de funcionamento e os serviços de cada{" "}
        {labels.professional.toLowerCase()} pra ele começar a receber agendamentos.
      </p>

      <ProfessionalsManager
        initialProfessionals={JSON.parse(JSON.stringify(professionals))}
        professionalLabel={labels.professional}
      />
    </main>
  );
}
