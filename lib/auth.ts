import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { extractTenantSlug } from "@/lib/tenant";

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  // Necessário porque cada tenant acessa por um subdomínio diferente
  // (barbearia-do-ze.seuapp.com, clinica-saude-total.seuapp.com...) - o Auth.js
  // por padrão só confia no host configurado; como a lista de subdomínios é
  // dinâmica, avisamos explicitamente pra confiar no host de cada requisição.
  trustHost: true,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Senha", type: "password" },
      },
      authorize: async (credentials, request) => {
        if (!credentials?.email || !credentials?.password) return null;

        // Identifica o tenant pelo subdomínio de onde veio o login (barbearia1.seuapp.com).
        // Se houver subdomínio, o login fica restrito a usuários DAQUELE tenant -
        // login/senha válidos de um cliente não funcionam no subdomínio de outro.
        const host = request?.headers.get("host") ?? null;
        const tenantSlug = extractTenantSlug(host);

        const candidates = await prisma.user.findMany({
          where: {
            email: credentials.email as string,
            ...(tenantSlug ? { tenant: { slug: tenantSlug } } : {}),
          },
          include: { professional: true, tenant: true },
        });

        for (const user of candidates) {
          const valid = await bcrypt.compare(
            credentials.password as string,
            user.passwordHash
          );
          if (valid) {
            if (user.tenant && !user.tenant.active) return null; // tenant suspenso/inadimplente

            return {
              id: user.id,
              name: user.name,
              email: user.email,
              role: user.role,
              professionalId: user.professional?.id ?? null,
              tenantId: user.tenantId,
              tenantSlug: user.tenant?.slug ?? null,
              tenantName: user.tenant?.name ?? null,
              businessType: user.tenant?.businessType ?? null,
            };
          }
        }
        return null;
      },
    }),
  ],
  callbacks: {
    // Propaga role, tenantId e professionalId para o token JWT e para a sessão
    jwt: async ({ token, user }) => {
      if (user) {
        const u = user as any;
        token.role = u.role;
        token.professionalId = u.professionalId;
        token.tenantId = u.tenantId;
        token.tenantSlug = u.tenantSlug;
        token.tenantName = u.tenantName;
        token.businessType = u.businessType;
      }
      return token;
    },
    session: async ({ session, token }) => {
      if (session.user) {
        (session.user as any).id = token.sub;
        (session.user as any).role = token.role;
        (session.user as any).professionalId = token.professionalId;
        (session.user as any).tenantId = token.tenantId;
        (session.user as any).tenantSlug = token.tenantSlug;
        (session.user as any).tenantName = token.tenantName;
        (session.user as any).businessType = token.businessType;
      }
      return session;
    },
  },
});

export type SessionUser = {
  role: "SUPER_ADMIN" | "ADMIN" | "PROFESSIONAL";
  professionalId: string | null;
  tenantId: string | null;
};

/**
 * Helper central de permissão. Camadas obrigatórias:
 * 1) SUPER_ADMIN (dono da plataforma) acessa qualquer tenant
 * 2) o profissional pertence ao MESMO tenant do usuário logado (isolamento entre clientes)
 * 3) dentro do tenant: ADMIN acessa qualquer profissional, PROFESSIONAL só o próprio
 */
export function canAccessProfessional(
  sessionUser: SessionUser,
  professionalTenantId: string,
  professionalId: string
) {
  if (sessionUser.role === "SUPER_ADMIN") return true;
  if (sessionUser.tenantId !== professionalTenantId) return false;
  if (sessionUser.role === "ADMIN") return true;
  return sessionUser.professionalId === professionalId;
}
