"use client";

import { useState } from "react";
import { format } from "date-fns";

export type ServiceOption = { serviceId: string; name: string; durationMin: number; price: number | null };

export function QuickCreateModal({
  professionalId,
  professionalLabel,
  start,
  services,
  patientLabel,
  onClose,
  onCreated,
}: {
  professionalId: string;
  professionalLabel: string;
  start: Date;
  services: ServiceOption[];
  patientLabel: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [serviceId, setServiceId] = useState(services[0]?.serviceId ?? "");
  const [patientName, setPatientName] = useState("");
  const [patientPhone, setPatientPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const res = await fetch("/api/appointments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        professionalId,
        serviceId,
        patientName,
        patientPhone: patientPhone || undefined,
        startAt: start.toISOString(),
      }),
    });

    setSaving(false);
    if (!res.ok) {
      const data = await res.json();
      setError(
        res.status === 409
          ? "Esse horário não cabe esse serviço (conflita com outro agendamento ou passa do expediente). Tente outro horário ou serviço."
          : data.error || "Não foi possível criar o agendamento."
      );
      return;
    }
    onCreated();
  }

  if (services.length === 0) {
    return (
      <ModalShell onClose={onClose} title="Novo agendamento">
        <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
          {professionalLabel} ainda não tem nenhum serviço vinculado. Cadastre em{" "}
          <span className="underline">Serviços</span> antes de agendar.
        </p>
      </ModalShell>
    );
  }

  return (
    <ModalShell onClose={onClose} title="Novo agendamento">
      <p className="text-sm mb-4" style={{ color: "var(--ink-soft)" }}>
        {professionalLabel} · {format(start, "dd/MM/yyyy 'às' HH:mm")}
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--ink-soft)" }}>
            Serviço
          </label>
          <select
            value={serviceId}
            onChange={(e) => setServiceId(e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-sm outline-none"
            style={{ border: "1px solid var(--line)" }}
          >
            {services.map((s) => (
              <option key={s.serviceId} value={s.serviceId}>
                {s.name} ({s.durationMin} min{s.price != null ? ` · R$ ${s.price.toFixed(2)}` : ""})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--ink-soft)" }}>
            {patientLabel}
          </label>
          <input
            required
            value={patientName}
            onChange={(e) => setPatientName(e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-sm outline-none"
            style={{ border: "1px solid var(--line)" }}
          />
        </div>

        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--ink-soft)" }}>
            Telefone (opcional)
          </label>
          <input
            value={patientPhone}
            onChange={(e) => setPatientPhone(e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-sm outline-none"
            style={{ border: "1px solid var(--line)" }}
          />
        </div>

        {error && (
          <p className="text-sm" style={{ color: "var(--amber)" }}>
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={saving}
          className="w-full px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-60"
          style={{ background: "var(--teal)" }}
        >
          {saving ? "Agendando..." : "Confirmar agendamento"}
        </button>
      </form>
    </ModalShell>
  );
}

export function AppointmentDetailModal({
  appointment,
  onClose,
  onChanged,
}: {
  appointment: { id: string; patientName: string; startAt: string; endAt: string; status: string };
  onClose: () => void;
  onChanged: () => void;
}) {
  const [loading, setLoading] = useState(false);

  async function updateStatus(status: string) {
    setLoading(true);
    await fetch(`/api/appointments/${appointment.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setLoading(false);
    onChanged();
  }

  return (
    <ModalShell onClose={onClose} title={appointment.patientName}>
      <p className="text-sm mb-6" style={{ color: "var(--ink-soft)" }}>
        {format(new Date(appointment.startAt), "dd/MM/yyyy")} ·{" "}
        {format(new Date(appointment.startAt), "HH:mm")}–{format(new Date(appointment.endAt), "HH:mm")}
      </p>

      {(appointment.status === "SCHEDULED" || appointment.status === "CONFIRMED") && (
        <div className="flex gap-2">
          <button
            onClick={() => updateStatus("COMPLETED")}
            disabled={loading}
            className="flex-1 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-60"
            style={{ background: "var(--sage)" }}
          >
            Marcar concluído
          </button>
          <button
            onClick={() => updateStatus("CANCELLED")}
            disabled={loading}
            className="flex-1 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-60"
            style={{ background: "var(--amber)" }}
          >
            Cancelar
          </button>
        </div>
      )}
      {appointment.status === "CANCELLED" && (
        <p className="text-sm" style={{ color: "var(--amber)" }}>
          Esse agendamento já está cancelado.
        </p>
      )}
      {appointment.status === "COMPLETED" && (
        <p className="text-sm" style={{ color: "var(--sage)" }}>
          Esse agendamento já foi concluído.
        </p>
      )}
    </ModalShell>
  );
}

function ModalShell({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(22, 38, 43, 0.4)" }}
      onClick={onClose}
    >
      <div
        className="rounded-2xl p-6 w-full max-w-sm"
        style={{ background: "var(--surface-card)", border: "1px solid var(--line)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-display text-lg font-semibold" style={{ color: "var(--ink)" }}>
            {title}
          </h3>
          <button onClick={onClose} className="text-sm" style={{ color: "var(--ink-soft)" }}>
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
