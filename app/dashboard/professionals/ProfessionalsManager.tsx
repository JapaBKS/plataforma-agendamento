"use client";

import { useState } from "react";
import Link from "next/link";

type Professional = {
  id: string;
  specialty: string | null;
  color: string;
  active: boolean;
  user: { name: string; email: string };
};

export function ProfessionalsManager({
  initialProfessionals,
  professionalLabel,
}: {
  initialProfessionals: Professional[];
  professionalLabel: string;
}) {
  const [professionals, setProfessionals] = useState(initialProfessionals);
  const [showForm, setShowForm] = useState(false);

  async function refresh() {
    const res = await fetch("/api/professionals");
    const data = await res.json();
    setProfessionals(data.professionals);
  }

  async function toggleActive(id: string, active: boolean) {
    await fetch(`/api/professionals/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !active }),
    });
    refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button
          onClick={() => setShowForm((v) => !v)}
          className="px-4 py-2 rounded-lg text-sm font-medium text-white"
          style={{ background: "var(--teal)" }}
        >
          {showForm ? "Cancelar" : `+ Novo ${professionalLabel.toLowerCase()}`}
        </button>
      </div>

      {showForm && (
        <NewProfessionalForm
          professionalLabel={professionalLabel}
          onCreated={() => {
            setShowForm(false);
            refresh();
          }}
        />
      )}

      <div className="space-y-3">
        {professionals.map((p) => (
          <div
            key={p.id}
            className="rounded-2xl p-4 flex items-center justify-between gap-3"
            style={{ background: "var(--surface-card)", border: "1px solid var(--line)" }}
          >
            <div className="flex items-center gap-3">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: p.color }} />
              <div>
                <p className="text-sm font-medium" style={{ color: "var(--ink)" }}>
                  {p.user.name}
                  {!p.active && (
                    <span className="text-xs font-normal ml-2" style={{ color: "var(--amber)" }}>
                      inativo
                    </span>
                  )}
                </p>
                <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
                  {p.user.email}
                  {p.specialty ? ` · ${p.specialty}` : ""}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <Link href={`/dashboard/${p.id}/hours`} className="text-xs underline" style={{ color: "var(--teal)" }}>
                Horário
              </Link>
              <Link href={`/dashboard/${p.id}`} className="text-xs underline" style={{ color: "var(--teal)" }}>
                Agenda
              </Link>
              <button
                onClick={() => toggleActive(p.id, p.active)}
                className="text-xs underline"
                style={{ color: "var(--amber)" }}
              >
                {p.active ? "Desativar" : "Ativar"}
              </button>
            </div>
          </div>
        ))}
        {professionals.length === 0 && (
          <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
            Nenhum {professionalLabel.toLowerCase()} cadastrado ainda — crie o primeiro acima.
          </p>
        )}
      </div>
    </div>
  );
}

function NewProfessionalForm({
  professionalLabel,
  onCreated,
}: {
  professionalLabel: string;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [color, setColor] = useState("#4F46E5");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch("/api/professionals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password, specialty: specialty || undefined, color }),
    });

    setLoading(false);
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Não foi possível criar.");
      return;
    }

    setName("");
    setEmail("");
    setPassword("");
    setSpecialty("");
    onCreated();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl p-5 space-y-4"
      style={{ background: "var(--surface-card)", border: "1px solid var(--line)" }}
    >
      <div className="grid grid-cols-2 gap-4">
        <Field label="Nome">
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-sm outline-none"
            style={{ border: "1px solid var(--line)" }}
          />
        </Field>
        <Field label={`Especialidade (opcional)`}>
          <input
            value={specialty}
            onChange={(e) => setSpecialty(e.target.value)}
            placeholder="Ex: Corte e barba"
            className="w-full rounded-lg px-3 py-2 text-sm outline-none"
            style={{ border: "1px solid var(--line)" }}
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Email de login">
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-sm outline-none"
            style={{ border: "1px solid var(--line)" }}
          />
        </Field>
        <Field label="Senha provisória">
          <input
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="mínimo 6 caracteres"
            className="w-full rounded-lg px-3 py-2 text-sm outline-none"
            style={{ border: "1px solid var(--line)" }}
          />
        </Field>
      </div>

      <Field label="Cor de identificação na agenda">
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="w-10 h-9 rounded cursor-pointer"
            style={{ border: "1px solid var(--line)" }}
          />
          <input
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="flex-1 rounded-lg px-3 py-2 text-sm outline-none font-mono"
            style={{ border: "1px solid var(--line)" }}
          />
        </div>
      </Field>

      {error && (
        <p className="text-sm" style={{ color: "var(--amber)" }}>
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-60"
        style={{ background: "var(--teal)" }}
      >
        {loading ? "Criando..." : `Criar ${professionalLabel.toLowerCase()}`}
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
