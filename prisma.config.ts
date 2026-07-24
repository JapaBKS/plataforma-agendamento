import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  // O Prisma CLI (migrate, studio) precisa da conexão DIRETA (sem pgbouncer).
  // A aplicação em si usa o DATABASE_URL (com pooler) via driver adapter em lib/prisma.ts.
  datasource: {
    url: process.env["DIRECT_URL"],
  },
});
