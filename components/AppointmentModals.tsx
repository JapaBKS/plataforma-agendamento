"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";

export type ServiceOption = { serviceId: string; name: string; durationMin: number; price: number | null };
export type ProfessionalOption = { id: string; name: string };

type SlotStatus =
  | { state: "checking" }
  | { state: "ok" }
  | { state: "outside_hours" }
  | { state: "conflict" }
  | { state: "past" }
  | { state: "not_offered" }
  | { state: "idle" };

export function QuickCreateModal({
  professionalId,
  professionalLabel,
  professionals,
  servicesByProfessional,
  start,
  services,
  patientLabel,
  onClose,
  onCreated,
}: {
  /** Use quando o profissional já é conhecido (visão individual / por profissional) */
  professionalId?: string;
  professionalLabel?: string;
  /** Use quando o profissional precisa ser escolhido (visão semanal, coluna = dia) */
  professionals?: ProfessionalOption[];
  servicesByProfessional?: Record<string, ServiceOption[]>;
  start: Date;
  services?: ServiceOption[];
  patientLabel: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const needsProfessionalPicker = !professionalId && !!professionals?.length;
  const [selectedProfessionalId, setSelectedProfessionalId] = useState(
    professionalId ?? professionals?.[0]?.id ?? ""
  );

  const availableServices = services ?? servicesByProfessional?.[selectedProfessionalId] ?? [];

  const [serviceId, setServiceId] = useState(availableServices[0]?.serviceId ?? "");
  const [patientName, setPatientName] = useState("");
  const [patientPhone, setPatientPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Verificação ANTECIPADA do horário: roda assim que profissional/serviço mudam,
  // pra recepção descobrir o problema antes de digitar os dados do cliente.
  const [status, setStatus] = useState<SlotStatus>({ state: "idle" });
  const [confirmOutsideHours, setConfirmOutsideHours] = useState(false);

  useEffect(() => {
    if (!selectedProfessionalId || !serviceId) {
      setStatus({ state: "idle" });
      return;
    }
    let cancelled = false;
    setStatus({ state: "checking" });
    setConfirmOutsideHours(false);

    fetch(
      `/api/professionals/${selectedProfessionalId}/check-slot?serviceId=${serviceId}&startAt=${encodeURIComponent(
        start.toISOString()
      )}`
    )
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.ok) setStatus({ state: "ok" });
        else setStatus({ state: (data.issue ?? "conflict") as SlotStatus["state"] });
      })
      .catch(() => {
        if (!cancelled) setStatus({ state: "idle" });
      });

    return () => {
      cancelled = true;
    };
  }, [selectedProfessionalId, serviceId, start]);

  function handleProfessionalChange(nextId: string) {
    setSelectedProfessionalId(nextId);
    const nextServices = servicesByProfessional?.[nextId] ?? [];
    setServiceId(nextServices[0]?.serviceId ?? "");
  }

  // Só bloqueia de vez o que é erro real. "Fora do expediente" libera com confirmação.
  const blocked =
    status.state === "conflict" || status.state === "past" || status.state === "not_offered";
  const needsConfirm = status.state === "outside_hours";
  const canSubmit = !saving && !blocked && (!needsConfirm || confirmOutsideHours);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const res = await fetch("/api/appointments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        professionalId: selectedProfessionalId,
        serviceId,
        patientName,
        patientPhone: patientPhone || undefined,
        startAt: start.toISOString(),
        allowOutsideHours: confirmOutsideHours,
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

  const headerLine = needsProfessionalPicker
    ? format(start, "dd/MM/yyyy 'às' HH:mm")
    : `${professionalLabel} · ${format(start, "dd/MM/yyyy 'às' HH:mm")}`;

  if (availableServices.length === 0) {
    return (
      <ModalShell onClose={onClose} title="Novo agendamento">
        <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
          Nenhum serviço vinculado ainda. Cadastre em <span className="underline">Serviços</span> antes de agendar.
        </p>
      </ModalShell>
    );
  }

  return (
    <ModalShell onClose={onClose} title="Novo agendamento">
      <p className="text-sm mb-4" style={{ color: "var(--ink-soft)" }}>
        {headerLine}
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        {needsProfessionalPicker && (
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--ink-soft)" }}>
              Profissional
            </label>
            <select
              value={selectedProfessionalId}
              onChange={(e) => handleProfessionalChange(e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={{ border: "1px solid var(--line)" }}
            >
              {professionals!.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        )}

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
            {availableServices.map((s) => (
              <option key={s.serviceId} value={s.serviceId}>
                {s.name} ({s.durationMin} min{s.price != null ? ` · R$ ${s.price.toFixed(2)}` : ""})
              </option>
            ))}
          </select>
        </div>

        {/* Aviso imediato, logo abaixo dos campos que definem a disponibilidade */}
        <SlotFeedback
          status={status}
          confirmOutsideHours={confirmOutsideHours}
          onToggleConfirm={setConfirmOutsideHours}
        />

        {/* Dados do cliente só aparecem quando faz sentido preencher */}
        {!blocked && (
          <>
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
          </>
        )}

        {error && (
          <p className="text-sm" style={{ color: "var(--amber)" }}>
            {error}
          </p>
        )}

        {!blocked && (
          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
            style={{ background: needsConfirm ? "var(--amber)" : "var(--teal)" }}
          >
            {saving ? "Agendando..." : needsConfirm ? "Agendar mesmo assim" : "Confirmar agendamento"}
          </button>
        )}
      </form>
    </ModalShell>
  );
}

/** Mensagem de disponibilidade, com a ação certa pra cada caso. */
function SlotFeedback({
  status,
  confirmOutsideHours,
  onToggleConfirm,
}: {
  status: SlotStatus;
  confirmOutsideHours: boolean;
  onToggleConfirm: (v: boolean) => void;
}) {
  if (status.state === "idle") return null;

  if (status.state === "checking") {
    return (
      <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
        Verificando disponibilidade...
      </p>
    );
  }

  if (status.state === "ok") {
    return (
      <p className="text-xs flex items-center gap-1.5" style={{ color: "var(--sage)" }}>
        <span>✓</span> Horário disponível
      </p>
    );
  }

  const messages: Record<string, string> = {
    conflict: "Esse profissional já tem outro compromisso nesse horário. Escolha outro horário ou outro profissional.",
    past: "Esse horário já passou.",
    not_offered: "Esse profissional não realiza o serviço selecionado.",
    outside_hours: "Fora do expediente cadastrado desse profissional.",
  };

  const isWarning = status.state === "outside_hours";

  return (
    <div
      className="rounded-lg px-3 py-2.5 text-xs"
      style={{
        background: isWarning
          ? "color-mix(in srgb, var(--amber) 12%, transparent)"
          : "color-mix(in srgb, var(--amber) 18%, transparent)",
        border: `1px solid var(--amber)`,
        color: "var(--ink)",
      }}
    >
      <p>{messages[status.state]}</p>

      {isWarning && (
        <label className="flex items-start gap-2 mt-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={confirmOutsideHours}
            onChange={(e) => onToggleConfirm(e.target.checked)}
            className="mt-0.5"
          />
          <span>Agendar mesmo assim (encaixe/exceção)</span>
        </label>
      )}
    </div>
  );
}

export function AppointmentDetailModal({
  appointment,
  onClose,
  onChanged,
}: {
  appointment: { id: string; patientName: string; sublabel?: string; startAt: string; endAt: string; status: string };
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
        {appointment.sublabel ? `${appointment.sublabel} · ` : ""}
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
