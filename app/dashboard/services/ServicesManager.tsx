"use client";

import { useState } from "react";

type Professional = {
  id: string;
  color: string;
  user: { name: string };
};

type ServiceLink = {
  professionalId: string;
  durationMin: number | null;
  price: number | null;
  professional: Professional;
};

type Service = {
  id: string;
  name: string;
  defaultDurationMin: number;
  price: number | null;
  active: boolean;
  professionals: ServiceLink[];
};

export function ServicesManager({
  initialServices,
  professionals,
  professionalLabel,
}: {
  initialServices: Service[];
  professionals: Professional[];
  professionalLabel: string;
}) {
  const [services, setServices] = useState<Service[]>(initialServices);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  async function refreshServices() {
    const res = await fetch("/api/services");
    const data = await res.json();
    setServices(data.services);
  }

  async function handleDeleteService(id: string) {
    if (!confirm("Remover esse serviço? Isso não apaga agendamentos já feitos com ele.")) return;
    await fetch(`/api/services/${id}`, { method: "DELETE" });
    setServices((prev) => prev.filter((s) => s.id !== id));
  }

  return (
    <div className="space-y-6">
      <NewServiceForm onCreated={refreshServices} />

      <div className="space-y-3">
        {services.map((service) => (
          <ServiceCard
            key={service.id}
            service={service}
            professionals={professionals}
            professionalLabel={professionalLabel}
            expanded={expandedId === service.id}
            onToggleExpand={() => setExpandedId(expandedId === service.id ? null : service.id)}
            onDelete={() => handleDeleteService(service.id)}
            onChanged={refreshServices}
          />
        ))}
        {services.length === 0 && (
          <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
            Nenhum serviço cadastrado ainda — crie o primeiro acima.
          </p>
        )}
      </div>
    </div>
  );
}

function NewServiceForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState("");
  const [duration, setDuration] = useState("30");
  const [price, setPrice] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch("/api/services", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        defaultDurationMin: Number(duration),
        price: price ? Number(price) : null,
      }),
    });

    setLoading(false);
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Não foi possível criar o serviço.");
      return;
    }

    setName("");
    setDuration("30");
    setPrice("");
    onCreated();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl p-5 flex flex-wrap items-end gap-3"
      style={{ background: "var(--surface-card)", border: "1px solid var(--line)" }}
    >
      <div className="flex-1 min-w-[160px]">
        <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--ink-soft)" }}>
          Nome do serviço
        </label>
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex: Corte + barba"
          className="w-full rounded-lg px-3 py-2 text-sm outline-none"
          style={{ border: "1px solid var(--line)" }}
        />
      </div>
      <div className="w-28">
        <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--ink-soft)" }}>
          Duração (min)
        </label>
        <input
          required
          type="number"
          min={5}
          step={5}
          value={duration}
          onChange={(e) => setDuration(e.target.value)}
          className="w-full rounded-lg px-3 py-2 text-sm outline-none"
          style={{ border: "1px solid var(--line)" }}
        />
      </div>
      <div className="w-28">
        <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--ink-soft)" }}>
          Preço (opcional)
        </label>
        <input
          type="number"
          min={0}
          step={0.01}
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="R$"
          className="w-full rounded-lg px-3 py-2 text-sm outline-none"
          style={{ border: "1px solid var(--line)" }}
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-60"
        style={{ background: "var(--teal)" }}
      >
        {loading ? "Criando..." : "+ Novo serviço"}
      </button>
      {error && (
        <p className="text-sm w-full" style={{ color: "var(--amber)" }}>
          {error}
        </p>
      )}
    </form>
  );
}

function ServiceCard({
  service,
  professionals,
  professionalLabel,
  expanded,
  onToggleExpand,
  onDelete,
  onChanged,
}: {
  service: Service;
  professionals: Professional[];
  professionalLabel: string;
  expanded: boolean;
  onToggleExpand: () => void;
  onDelete: () => void;
  onChanged: () => void;
}) {
  const linkedIds = new Set(service.professionals.map((l) => l.professionalId));

  async function toggleProfessional(professionalId: string, linked: boolean) {
    if (linked) {
      await fetch(`/api/services/${service.id}/professionals?professionalId=${professionalId}`, {
        method: "DELETE",
      });
    } else {
      await fetch(`/api/services/${service.id}/professionals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ professionalId }),
      });
    }
    onChanged();
  }

  async function updateOverride(professionalId: string, durationMin: string) {
    await fetch(`/api/services/${service.id}/professionals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        professionalId,
        durationMin: durationMin ? Number(durationMin) : null,
      }),
    });
    onChanged();
  }

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: "var(--surface-card)", border: "1px solid var(--line)" }}>
      <div className="flex items-center justify-between px-5 py-4">
        <button onClick={onToggleExpand} className="flex-1 text-left">
          <p className="font-medium text-sm" style={{ color: "var(--ink)" }}>
            {service.name}
          </p>
          <p className="text-xs mt-0.5" style={{ color: "var(--ink-soft)" }}>
            {service.defaultDurationMin} min
            {service.price != null ? ` · R$ ${service.price.toFixed(2)}` : ""} ·{" "}
            {service.professionals.length} {professionalLabel.toLowerCase()}
            {service.professionals.length === 1 ? "" : "s"}
          </p>
        </button>
        <div className="flex items-center gap-3">
          <button
            onClick={onToggleExpand}
            className="text-xs underline"
            style={{ color: "var(--teal)" }}
          >
            {expanded ? "Fechar" : "Gerenciar"}
          </button>
          <button onClick={onDelete} className="text-xs underline" style={{ color: "var(--amber)" }}>
            Remover
          </button>
        </div>
      </div>

      {expanded && (
        <div className="px-5 pb-5 pt-1 space-y-2" style={{ borderTop: "1px solid var(--line)" }}>
          <p className="text-xs pt-4 pb-1" style={{ color: "var(--ink-soft)" }}>
            Quem realiza esse serviço (deixe a duração em branco pra usar o padrão de {service.defaultDurationMin} min)
          </p>
          {professionals.map((prof) => {
            const link = service.professionals.find((l) => l.professionalId === prof.id);
            const linked = linkedIds.has(prof.id);
            return (
              <div key={prof.id} className="flex items-center gap-3 py-1.5">
                <input
                  type="checkbox"
                  checked={linked}
                  onChange={() => toggleProfessional(prof.id, linked)}
                  className="w-4 h-4"
                />
                <span className="w-2 h-2 rounded-full" style={{ background: prof.color }} />
                <span className="text-sm flex-1" style={{ color: "var(--ink)" }}>
                  {prof.user.name}
                </span>
                {linked && (
                  <input
                    type="number"
                    min={5}
                    step={5}
                    placeholder={`${service.defaultDurationMin} min (padrão)`}
                    defaultValue={link?.durationMin ?? ""}
                    onBlur={(e) => updateOverride(prof.id, e.target.value)}
                    className="w-40 rounded-lg px-2 py-1 text-xs outline-none"
                    style={{ border: "1px solid var(--line)" }}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
