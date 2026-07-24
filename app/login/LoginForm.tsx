"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export function LoginForm({
  tenantName,
  accentColor,
}: {
  tenantName: string | null;
  accentColor: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (res?.error) {
      setError("Email ou senha incorretos.");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div
      className="w-full max-w-sm rounded-2xl p-8 shadow-sm"
      style={{ background: "var(--surface-card)", border: "1px solid var(--line)" }}
    >
      {tenantName && (
        <p className="text-xs font-medium uppercase tracking-wide mb-2" style={{ color: accentColor }}>
          {tenantName}
        </p>
      )}
      <h1 className="font-display text-2xl font-semibold mb-1" style={{ color: "var(--ink)" }}>
        Entrar na agenda
      </h1>
      <p className="text-sm mb-6" style={{ color: "var(--ink-soft)" }}>
        Acesse com o email e senha cadastrados pelo administrador.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm mb-1" style={{ color: "var(--ink-soft)" }}>
            Email
          </label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-sm outline-none"
            style={{ border: "1px solid var(--line)" }}
            placeholder="voce@email.com"
          />
        </div>
        <div>
          <label className="block text-sm mb-1" style={{ color: "var(--ink-soft)" }}>
            Senha
          </label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-sm outline-none"
            style={{ border: "1px solid var(--line)" }}
            placeholder="••••••••"
          />
        </div>

        {error && (
          <p className="text-sm" style={{ color: "var(--amber)" }}>
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg py-2 text-sm font-medium text-white transition-opacity disabled:opacity-60"
          style={{ background: accentColor }}
        >
          {loading ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </div>
  );
}
