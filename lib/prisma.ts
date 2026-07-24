import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// A partir do Prisma 7, a conexão da aplicação precisa de um "driver adapter"
// explícito. Aqui usamos o DATABASE_URL (com pooler do Supabase) - é o correto
// para tráfego da aplicação. O prisma.config.ts usa o DIRECT_URL separadamente,
// só para migrations via CLI.
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

// Evita múltiplas instâncias do PrismaClient em dev (hot-reload)
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
