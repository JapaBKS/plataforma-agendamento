import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Necessário em dev: cada tenant acessa por um subdomínio (ex: barbearia-do-ze.lvh.me),
  // e o Next bloqueia por padrão recursos de desenvolvimento vindos de origens diferentes
  // de localhost. Isso libera qualquer subdomínio de lvh.me.
  allowedDevOrigins: ["*.lvh.me"],
};

export default nextConfig;
