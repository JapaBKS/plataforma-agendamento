import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { auth, canAccessProfessional } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { HoursEditor } from "./HoursEditor";

export default async function HoursPage({
  params,
}: {
  params: Promise<{ professionalId: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const user = session.user as any;
  const { professionalId } = await params;

  const professional = await prisma.professional.findUnique({
    where: { id: professionalId },
    include: { user: true },
  });
  if (!professional) notFound();

  if (!canAccessProfessional(user, professional.tenantId, professionalId)) {
    redirect("/dashboard");
  }

  const slots = await prisma.availabilitySlot.findMany({
    where: { professionalId },
    orderBy: { weekday: "asc" },
  });

  return (
    <main className="flex-1 px-6 py-8 max-w-2xl mx-auto w-full" style={{ background: "var(--surface)" }}>
      <Link href={`/dashboard/${professionalId}`} className="text-sm mb-4 inline-block" style={{ color: "var(--teal)" }}>
        ← Voltar para a agenda
      </Link>
      <h1 className="font-display text-3xl font-semibold mb-1" style={{ color: "var(--ink)" }}>
        Horário de funcionamento
      </h1>
      <p className="text-sm mb-8" style={{ color: "var(--ink-soft)" }}>
        {professional.user.name} — define quando o sistema pode oferecer horários, tanto no dashboard
        quanto nas automações do N8N.
      </p>

      <HoursEditor professionalId={professionalId} initialSlots={JSON.parse(JSON.stringify(slots))} />
    </main>
  );
}
