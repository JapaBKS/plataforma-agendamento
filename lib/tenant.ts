import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";

/**
 * O domínio raiz da plataforma, ex.: "seuapp.com".
 * Em dev, use algo como "lvh.me" (resolve para 127.0.0.1 e aceita subdomínios,
 * ex.: barbearia1.lvh.me:3000) ou configure hosts locais manualmente.
 */
const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || "lvh.me";

/**
 * Extrai o slug do tenant a partir do host da requisição.
 * "barbearia1.seuapp.com" -> "barbearia1"
 * "seuapp.com" ou "www.seuapp.com" -> null (domínio raiz, sem tenant)
 * "localhost:3000" -> null (útil pra rodar sem multi-tenant em dev rápido)
 */
export function extractTenantSlug(host: string | null): string | null {
  if (!host) return null;
  const hostname = host.split(":")[0]; // remove a porta

  if (hostname === "localhost" || hostname === "127.0.0.1") return null;

  const rootParts = ROOT_DOMAIN.split(".");
  const hostParts = hostname.split(".");

  if (hostParts.length <= rootParts.length) return null; // é o domínio raiz, sem subdomínio

  const subdomain = hostParts.slice(0, hostParts.length - rootParts.length).join(".");
  if (subdomain === "www") return null;

  return subdomain;
}

/** Lê o slug do tenant atual a partir do header setado pelo middleware. */
export async function getCurrentTenantSlug(): Promise<string | null> {
  const h = await headers();
  return h.get("x-tenant-slug");
}

/** Busca o Tenant completo (para branding/labels) a partir do subdomínio atual. */
export async function getCurrentTenant() {
  const slug = await getCurrentTenantSlug();
  if (!slug) return null;

  return prisma.tenant.findUnique({ where: { slug } });
}
