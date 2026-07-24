"use client";

import { useState } from "react";
import Link from "next/link";

const BUSINESS_TYPES = [
  { value: "CLINICA", label: "Clínica" },
  { value: "BARBEARIA", label: "Barbearia" },
  { value: "ESTETICA", label: "Estética" },
  { value: "OUTRO", label: "Outro" },
] as const;

const PLANS = [
  { value: "BASICO", label: "Básico" },
  { value: "PRO", label: "Pro" },
  { value: "ENTERPRISE", label: "Enterprise" },
] as const;

function slugify(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove acentos
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export function NewTenantForm({ rootDomain }: { rootDomain: string }) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [businessType, setBusinessType] = useState<(typeof BUSINESS_TYPES)[number]["value"]>("OUTRO");
  const [plan, setPlan] = useState<(typeof PLANS)[number]["value"]>("BASICO");
  const [primaryColor, setPrimaryColor] = useState("#1F6F63");
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ slug: string; apiKey: string } | null>(null);

  function handleNameChange(value: string) {
    setName(value);
    if (!slugTouched) setSlug(slugify(value));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch("/api/admin/tenants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        slug,
        businessType,
        plan,
        primaryColor,
        adminName,
        adminEmail,
        adminPassword,
      }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error || "Não foi possível criar o cliente.");
      return;
    }

    setResult({ slug: data.tenant.slug, apiKey: data.apiKey });
  }

  // Tela de sucesso: mostra a API key UMA vez, com aviso claro pra copiar agora
  if (result) {
    const loginUrl = `http://${result.slug}.${rootDomain}/login`;
    return (
      <div
        className="rounded-2xl p-6"
        style={{ background: "var(--surface-card)", border: "1px solid var(--line)" }}
      >
        <p className="text-sm font-medium mb-1" style={{ color: "var(--teal)" }}>
          Cliente criado com sucesso
        </p>
        <h2 className="font-display text-xl font-semibold mb-4" style={{ color: "var(--ink)" }}>
          Guarde estas informações agora
        </h2>

        <div className="space-y-3 mb-6">
          <Field label="Endereço de acesso">
            <a href={loginUrl} target="_blank" className="text-sm underline" style={{ color: "var(--teal)" }}>
              {loginUrl}
            </a>
          </Field>
          <Field label="API key do N8N (só aparece agora, não fica salva em texto legível)">
            <code
              className="block text-xs p-3 rounded-lg break-all"
              style={{ background: "var(--surface)", border: "1px solid var(--line)" }}
            >
              {result.apiKey}
            </code>
          </Field>
        </div>

        <p className="text-sm mb-4" style={{ color: "var(--amber)" }}>
          Copie a API key agora — ela não pode ser recuperada depois desta tela.
        </p>

        <div className="flex gap-3">
          <Link href="/admin" className="text-sm underline" style={{ color: "var(--ink-soft)" }}>
            Voltar para a lista de clientes
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl p-6 space-y-5"
      style={{ background: "var(--surface-card)", border: "1px solid var(--line)" }}
    >
      <div>
        <h2 className="font-display text-lg font-semibold mb-1" style={{ color: "var(--ink)" }}>
          Dados do negócio
        </h2>
        <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
          Isso define a identidade e o endereço de acesso do cliente na plataforma.
        </p>
      </div>

      <Field label="Nome do negócio">
        <input
          required
          value={name}
          onChange={(e) => handleNameChange(e.target.value)}
          placeholder="Ex: Barbearia do Zé"
          className="w-full rounded-lg px-3 py-2 text-sm outline-none"
          style={{ border: "1px solid var(--line)" }}
        />
      </Field>

      <Field label={`Subdomínio de acesso (${slug || "..."}.${rootDomain})`}>
        <input
          required
          value={slug}
          onChange={(e) => {
            setSlugTouched(true);
            setSlug(slugify(e.target.value));
          }}
          placeholder="barbearia-do-ze"
          className="w-full rounded-lg px-3 py-2 text-sm outline-none font-mono"
          style={{ border: "1px solid var(--line)" }}
        />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Tipo de negócio">
          <select
            value={businessType}
            onChange={(e) => setBusinessType(e.target.value as typeof businessType)}
            className="w-full rounded-lg px-3 py-2 text-sm outline-none"
            style={{ border: "1px solid var(--line)" }}
          >
            {BUSINESS_TYPES.map((bt) => (
              <option key={bt.value} value={bt.value}>
                {bt.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Plano">
          <select
            value={plan}
            onChange={(e) => setPlan(e.target.value as typeof plan)}
            className="w-full rounded-lg px-3 py-2 text-sm outline-none"
            style={{ border: "1px solid var(--line)" }}
          >
            {PLANS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Cor de identidade">
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={primaryColor}
              onChange={(e) => setPrimaryColor(e.target.value)}
              className="w-10 h-9 rounded cursor-pointer"
              style={{ border: "1px solid var(--line)" }}
            />
            <input
              value={primaryColor}
              onChange={(e) => setPrimaryColor(e.target.value)}
              className="flex-1 rounded-lg px-3 py-2 text-sm outline-none font-mono"
              style={{ border: "1px solid var(--line)" }}
            />
          </div>
        </Field>
      </div>

      <div className="pt-2" style={{ borderTop: "1px solid var(--line)" }}>
        <h2 className="font-display text-lg font-semibold mb-1 mt-4" style={{ color: "var(--ink)" }}>
          Login inicial do cliente
        </h2>
        <p className="text-xs mb-4" style={{ color: "var(--ink-soft)" }}>
          A pessoa responsável (dono/secretária) usa isso pra entrar pela primeira vez.
        </p>
      </div>

      <Field label="Nome">
        <input
          required
          value={adminName}
          onChange={(e) => setAdminName(e.target.value)}
          placeholder="Ex: Secretária Principal"
          className="w-full rounded-lg px-3 py-2 text-sm outline-none"
          style={{ border: "1px solid var(--line)" }}
        />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Email">
          <input
            required
            type="email"
            value={adminEmail}
            onChange={(e) => setAdminEmail(e.target.value)}
            placeholder="contato@negocio.com"
            className="w-full rounded-lg px-3 py-2 text-sm outline-none"
            style={{ border: "1px solid var(--line)" }}
          />
        </Field>
        <Field label="Senha provisória">
          <input
            required
            type="text"
            minLength={6}
            value={adminPassword}
            onChange={(e) => setAdminPassword(e.target.value)}
            placeholder="mínimo 6 caracteres"
            className="w-full rounded-lg px-3 py-2 text-sm outline-none"
            style={{ border: "1px solid var(--line)" }}
          />
        </Field>
      </div>

      {error && (
        <p className="text-sm" style={{ color: "var(--amber)" }}>
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg py-2.5 text-sm font-medium text-white disabled:opacity-60"
        style={{ background: "var(--teal)" }}
      >
        {loading ? "Criando..." : "Criar cliente"}
      </button>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--ink-soft)" }}>
        {label}
      </label>
      {children}
    </div>
  );
}
