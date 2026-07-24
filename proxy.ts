import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { extractTenantSlug } from "@/lib/tenant";

/**
 * Roda em TODA requisição (Node.js runtime, não Edge - necessário porque
 * lib/auth.ts usa Prisma/bcrypt, que não funcionam no Edge runtime):
 * 1) identifica o tenant pelo subdomínio e repassa como header "x-tenant-slug"
 *    para Server Components/Route Handlers (via lib/tenant.ts)
 * 2) protege as rotas /dashboard exigindo sessão, como antes
 *
 * Next.js 16 renomeou "middleware" para "proxy" - a lógica é a mesma,
 * só muda o nome do arquivo e da função exportada.
 */
export const proxy = auth((req) => {
  const host = req.headers.get("host");
  const tenantSlug = extractTenantSlug(host);

  const requestHeaders = new Headers(req.headers);
  if (tenantSlug) {
    requestHeaders.set("x-tenant-slug", tenantSlug);
  }

  const isDashboardRoute = req.nextUrl.pathname.startsWith("/dashboard");
  const isAdminRoute = req.nextUrl.pathname.startsWith("/admin");

  if ((isDashboardRoute || isAdminRoute) && !req.auth) {
    const loginUrl = new URL("/login", req.url);
    return NextResponse.redirect(loginUrl);
  }

  // /admin é exclusivo do SUPER_ADMIN (você, dono da plataforma) - qualquer
  // outro papel autenticado que tentar acessar volta pro próprio dashboard.
  if (isAdminRoute && req.auth && (req.auth.user as any)?.role !== "SUPER_ADMIN") {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  return NextResponse.next({ request: { headers: requestHeaders } });
});

export const config = {
  // roda em tudo, exceto assets estáticos - precisamos do header de tenant
  // disponível também em /login e nas rotas /api/n8n/*
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
