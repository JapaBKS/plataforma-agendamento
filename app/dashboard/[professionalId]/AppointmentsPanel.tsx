"use client";

import { useState } from "react";
import { format } from "date-fns";

type Appointment = {
  id: string;
  patientName: string;
  patientPhone: string | null;
  startAt: string;
  status: string;
  price: number | null;
};

type ServiceOption = { serviceId: string; name: string; durationMin: number; price: number | null };

export function AppointmentsPanel({
  professionalId,
  initialAppointments,
  services,
  appointmentLabel,
  patientLabel,
  from,
  to,
}: {
  professionalId: string;
  initialAppointments: Appointment[];
  services: ServiceOption[];
  appointmentLabel: string;
  patientLabel: string;
  from: string;
  to: string;
}) {
  const [appointments, setAppointments] = useState(initialAppointments);
  const [showForm, setShowForm] = useState(false);

  async function refresh() {
    const res = await fetch(`/api/appointments?professionalId=${professionalId}&from=${from}&to=${to}`);
    const data = await res.json();
    setAppointments(data.appointments);
  }

  async function handleCancel(id: string) {
    if (!confirm("Cancelar esse agendamento?")) return;
    await fetch(`/api/appointments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "CANCELLED" }),
    });
    refresh();
  }

  async function handleComplete(id: string) {
    await fetch(`/api/appointments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "COMPLETED" }),
    });
    refresh();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display text-xl font-semibold" style={{ color: "var(--ink)" }}>
          {appointmentLabel}s
        </h2>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="px-4 py-2 rounded-lg text-sm font-medium text-white"
          style={{ background: "var(--teal)" }}
        >
          {showForm ? "Cancelar" : `+ Novo ${appointmentLabel.toLowerCase()}`}
        </button>
      </div>

      {showForm && (
        <NewAppointmentForm
          professionalId={professionalId}
          services={services}
          patientLabel={patientLabel}
          onCreated={() => {
            setShowForm(false);
            refresh();
          }}
        />
      )}

      <div className="rounded-2xl overflow-hidden mt-4" style={{ border: "1px solid var(--line)" }}>
        {appointments.length === 0 && (
          <p className="p-5 text-sm" style={{ color: "var(--ink-soft)" }}>
            Nenhum {appointmentLabel.toLowerCase()} neste período.
          </p>
        )}
        {appointments.map((a, i) => (
          <div
            key={a.id}
            className="flex items-center justify-between px-5 py-4 gap-3"
            style={{ background: "var(--surface-card)", borderTop: i === 0 ? "none" : "1px solid var(--line)" }}
          >
            <div>
              <p className="font-medium text-sm" style={{ color: "var(--ink)" }}>
                {a.patientName}
              </p>
              <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
                {format(new Date(a.startAt), "dd/MM/yyyy HH:mm")}
                {a.price != null ? ` · R$ ${a.price.toFixed(2)}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={a.status} />
              {(a.status === "SCHEDULED" || a.status === "CONFIRMED") && (
                <>
                  <button
                    onClick={() => handleComplete(a.id)}
                    className="text-xs underline"
                    style={{ color: "var(--sage)" }}
                  >
                    Concluir
                  </button>
                  <button
                    onClick={() => handleCancel(a.id)}
                    className="text-xs underline"
                    style={{ color: "var(--amber)" }}
                  >
                    Cancelar
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function NewAppointmentForm({
  professionalId,
  services,
  patientLabel,
  onCreated,
}: {
  professionalId: string;
  services: ServiceOption[];
  patientLabel: string;
  onCreated: () => void;
}) {
  const [serviceId, setServiceId] = useState(services[0]?.serviceId ?? "");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [availableTimes, setAvailableTimes] = useState<string[]>([]);
  const [selectedTime, setSelectedTime] = useState("");
  const [patientName, setPatientName] = useState("");
  const [patientPhone, setPatientPhone] = useState("");
  const [loadingTimes, setLoadingTimes] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadTimes(nextServiceId: string, nextDate: string) {
    if (!nextServiceId || !nextDate) return;
    setLoadingTimes(true);
    setSelectedTime("");
    const res = await fetch(
      `/api/professionals/${professionalId}/available-times?serviceId=${nextServiceId}&date=${nextDate}`
    );
    const data = await res.json();
    setLoadingTimes(false);
    setAvailableTimes(res.ok ? data.availableStartTimes : []);
  }

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
        startAt: selectedTime,
      }),
    });

    setSaving(false);
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Não foi possível criar o agendamento.");
      return;
    }
    onCreated();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl p-5 space-y-4"
      style={{ background: "var(--surface-card)", border: "1px solid var(--line)" }}
    >
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--ink-soft)" }}>
            Serviço
          </label>
          <select
            value={serviceId}
            onChange={(e) => {
              setServiceId(e.target.value);
              loadTimes(e.target.value, date);
            }}
            className="w-full rounded-lg px-3 py-2 text-sm outline-none"
            style={{ border: "1px solid var(--line)" }}
          >
            {services.map((s) => (
              <option key={s.serviceId} value={s.serviceId}>
                {s.name} ({s.durationMin} min)
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--ink-soft)" }}>
            Data
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              loadTimes(serviceId, e.target.value);
            }}
            className="w-full rounded-lg px-3 py-2 text-sm outline-none"
            style={{ border: "1px solid var(--line)" }}
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--ink-soft)" }}>
          Horário disponível
        </label>
        {loadingTimes ? (
          <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
            Carregando...
          </p>
        ) : availableTimes.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
            {date && serviceId ? "Nenhum horário livre nesse dia. Escolha um serviço e uma data." : "Escolha um serviço e uma data."}
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {availableTimes.map((t) => (
              <button
                type="button"
                key={t}
                onClick={() => setSelectedTime(t)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium"
                style={{
                  background: selectedTime === t ? "var(--teal)" : "var(--surface)",
                  color: selectedTime === t ? "#fff" : "var(--ink)",
                  border: "1px solid var(--line)",
                }}
              >
                {format(new Date(t), "HH:mm")}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
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
      </div>

      {error && (
        <p className="text-sm" style={{ color: "var(--amber)" }}>
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={saving || !selectedTime}
        className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-60"
        style={{ background: "var(--teal)" }}
      >
        {saving ? "Agendando..." : "Confirmar agendamento"}
      </button>
    </form>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string }> = {
    SCHEDULED: { label: "Agendado", color: "var(--teal)" },
    CONFIRMED: { label: "Confirmado", color: "var(--teal-deep)" },
    CANCELLED: { label: "Cancelado", color: "var(--amber)" },
    COMPLETED: { label: "Concluído", color: "var(--sage)" },
    NO_SHOW: { label: "Não compareceu", color: "var(--amber)" },
  };
  const s = map[status] ?? { label: status, color: "var(--ink-soft)" };
  return (
    <span className="text-xs font-medium px-2.5 py-1 rounded-full" style={{ color: "#fff", background: s.color }}>
      {s.label}
    </span>
  );
}
