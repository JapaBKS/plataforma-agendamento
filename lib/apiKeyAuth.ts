import { NextRequest } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";

/**
 * Valida o header "x-api-key" enviado pelo N8N (via HTTP Request node).
 * Cada tenant (cliente) tem sua PRÓPRIA API key, então validar a chave já
 * identifica automaticamente de qual tenant é a requisição - o N8N do
 * cliente A nunca consegue, nem por engano, mexer nos dados do cliente B.
 *
 * Retorna o tenantId correspondente à chave, ou null se inválida.
 *
 * No N8N: configure o HTTP Request node com um header:
 *   x-api-key: <chave-gerada-para-esse-tenant>
 */
export async function getTenantFromApiKey(req: NextRequest): Promise<string | null> {
  const key = req.headers.get("x-api-key");
  if (!key) return null;

  const keyHash = crypto.createHash("sha256").update(key).digest("hex");

  const record = await prisma.apiKey.findUnique({ where: { keyHash } });
  if (!record || !record.active) return null;

  await prisma.apiKey.update({
    where: { id: record.id },
    data: { lastUsedAt: new Date() },
  });

  return record.tenantId;
}

/** Gera uma nova API key para um tenant específico (rode em script/console) */
export function generateApiKey() {
  const rawKey = crypto.randomBytes(32).toString("hex");
  const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");
  return { rawKey, keyHash }; // guarde o rawKey só para entregar ao cliente; salve o keyHash no banco
}
