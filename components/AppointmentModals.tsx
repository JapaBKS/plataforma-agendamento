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
  const [notes, setNotes] = useState("");
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
        notes: notes || undefined,
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

            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--ink-soft)" }}>
                Observações (opcional)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Ex: cliente pediu pra ligar antes"
                className="w-full rounded-lg px-3 py-2 text-sm outline-none resize-none"
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

type FullAppointment = {
  id: string;
  professionalId: string;
  professionalName: string;
  serviceId: string | null;
  serviceName: string | null;
  patientName: string;
  patientPhone: string | null;
  patientEmail: string | null;
  startAt: string;
  endAt: string;
  status: string;
  price: number | null;
  notes: string | null;
  source: string;
};

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  SCHEDULED: { label: "Agendado", color: "var(--teal)" },
  CONFIRMED: { label: "Confirmado", color: "var(--teal-deep)" },
  CANCELLED: { label: "Cancelado", color: "var(--amber)" },
  COMPLETED: { label: "Concluído", color: "var(--sage)" },
  NO_SHOW: { label: "Faltou", color: "var(--amber)" },
};

/**
 * Modal do agendamento. Três modos:
 * - view: dados + mudança de status + atalhos pras outras ações
 * - edit: altera serviço, dados do cliente e observações
 * - reschedule: move data/hora (e profissional, quando há mais de um disponível)
 */
export function AppointmentDetailModal({
  appointment,
  professionals,
  servicesByProfessional,
  patientLabel,
  canDelete = true,
  onClose,
  onChanged,
}: {
  appointment: { id: string; patientName: string; sublabel?: string; startAt: string; endAt: string; status: string };
  professionals?: ProfessionalOption[];
  servicesByProfessional?: Record<string, ServiceOption[]>;
  patientLabel?: string;
  canDelete?: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [mode, setMode] = useState<"view" | "edit" | "reschedule">("view");
  const [full, setFull] = useState<FullAppointment | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Busca os detalhes completos ao abrir (o calendário só tem o resumo)
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/appointments/${appointment.id}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && data.appointment) setFull(data.appointment);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [appointment.id]);

  async function updateStatus(status: string) {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/appointments/${appointment.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Não foi possível atualizar.");
      return;
    }
    onChanged();
  }

  async function handleDelete() {
    if (!confirm("Excluir este agendamento de vez? Ele some do histórico e dos relatórios.\n\nSe a ideia é registrar que não aconteceu, use Cancelar ou Faltou.")) {
      return;
    }
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/appointments/${appointment.id}`, { method: "DELETE" });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Não foi possível excluir.");
      return;
    }
    onChanged();
  }

  const status = full?.status ?? appointment.status;
  const isOpen = status === "SCHEDULED" || status === "CONFIRMED";
  const badge = STATUS_LABEL[status] ?? { label: status, color: "var(--ink-soft)" };

  const title =
    mode === "edit" ? "Editar agendamento" : mode === "reschedule" ? "Reagendar" : full?.patientName ?? appointment.patientName;

  return (
    <ModalShell onClose={onClose} title={title} wide={mode !== "view"}>
      {mode === "view" && (
        <>
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <span
              className="text-xs font-medium px-2.5 py-1 rounded-full"
              style={{ color: "#fff", background: badge.color }}
            >
              {badge.label}
            </span>
            {full?.source === "n8n" && (
              <span className="text-xs" style={{ color: "var(--ink-soft)" }}>
                via automação
              </span>
            )}
          </div>

          <div className="space-y-1.5 mb-5 text-sm">
            <InfoLine label="Quando">
              {format(new Date(appointment.startAt), "dd/MM/yyyy")} ·{" "}
              {format(new Date(appointment.startAt), "HH:mm")}–{format(new Date(appointment.endAt), "HH:mm")}
            </InfoLine>
            {full && (
              <>
                <InfoLine label="Profissional">{full.professionalName}</InfoLine>
                {full.serviceName && (
                  <InfoLine label="Serviço">
                    {full.serviceName}
                    {full.price != null ? ` · R$ ${full.price.toFixed(2)}` : ""}
                  </InfoLine>
                )}
                {full.patientPhone && <InfoLine label="Telefone">{full.patientPhone}</InfoLine>}
                {full.notes && <InfoLine label="Obs.">{full.notes}</InfoLine>}
              </>
            )}
          </div>

          {/* Mudança de status.
              CONFIRMED continua existindo no banco e na API, mas não tem botão:
              marcar "confirmado" na mão não muda nada no dia a dia. Esse status
              é pra ser preenchido AUTOMATICAMENTE pelo N8N quando o cliente
              responder ao lembrete - aí ele passa a ter utilidade real (saber
              quem não respondeu). */}
          {isOpen && (
            <div className="flex gap-2 mb-3 flex-wrap">
              <ActionButton onClick={() => updateStatus("COMPLETED")} disabled={loading} color="var(--sage)">
                Concluir
              </ActionButton>
              <ActionButton onClick={() => updateStatus("NO_SHOW")} disabled={loading} color="var(--amber)">
                Faltou
              </ActionButton>
            </div>
          )}

          {!isOpen && (
            <div className="mb-3">
              <ActionButton onClick={() => updateStatus("SCHEDULED")} disabled={loading} color="var(--teal)">
                Reabrir agendamento
              </ActionButton>
            </div>
          )}

          {error && (
            <p className="text-sm mb-3" style={{ color: "var(--amber)" }}>
              {error}
            </p>
          )}

          {/* Ações secundárias */}
          <div
            className="flex items-center gap-4 flex-wrap pt-3 text-xs"
            style={{ borderTop: "1px solid var(--line)" }}
          >
            <button onClick={() => setMode("edit")} className="underline" style={{ color: "var(--teal)" }}>
              Editar dados
            </button>
            <button onClick={() => setMode("reschedule")} className="underline" style={{ color: "var(--teal)" }}>
              Reagendar
            </button>
            {isOpen && (
              <button
                onClick={() => updateStatus("CANCELLED")}
                disabled={loading}
                className="underline"
                style={{ color: "var(--amber)" }}
              >
                Cancelar
              </button>
            )}
            {canDelete && (
              <button
                onClick={handleDelete}
                disabled={loading}
                className="underline ml-auto"
                style={{ color: "var(--ink-soft)" }}
              >
                Excluir
              </button>
            )}
          </div>
        </>
      )}

      {mode === "edit" && full && (
        <EditForm
          full={full}
          services={servicesByProfessional?.[full.professionalId]}
          patientLabel={patientLabel ?? "Cliente"}
          onCancel={() => setMode("view")}
          onSaved={onChanged}
        />
      )}

      {mode === "reschedule" && full && (
        <RescheduleForm
          full={full}
          professionals={professionals}
          servicesByProfessional={servicesByProfessional}
          onCancel={() => setMode("view")}
          onSaved={onChanged}
        />
      )}

      {mode !== "view" && !full && (
        <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
          Carregando...
        </p>
      )}
    </ModalShell>
  );
}

function EditForm({
  full,
  services,
  patientLabel,
  onCancel,
  onSaved,
}: {
  full: FullAppointment;
  services?: ServiceOption[];
  patientLabel: string;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [serviceId, setServiceId] = useState(full.serviceId ?? "");
  const [patientName, setPatientName] = useState(full.patientName);
  const [patientPhone, setPatientPhone] = useState(full.patientPhone ?? "");
  const [notes, setNotes] = useState(full.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const serviceChanged = serviceId !== (full.serviceId ?? "");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const res = await fetch(`/api/appointments/${full.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(serviceChanged ? { serviceId } : {}),
        patientName,
        patientPhone: patientPhone || null,
        notes: notes || null,
      }),
    });

    setSaving(false);
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Não foi possível salvar.");
      return;
    }
    onSaved();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {services && services.length > 0 && (
        <Field label="Serviço">
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
          {serviceChanged && (
            <p className="text-xs mt-1.5" style={{ color: "var(--ink-soft)" }}>
              Trocar o serviço ajusta a duração e o preço deste agendamento.
            </p>
          )}
        </Field>
      )}

      <Field label={patientLabel}>
        <input
          required
          value={patientName}
          onChange={(e) => setPatientName(e.target.value)}
          className="w-full rounded-lg px-3 py-2 text-sm outline-none"
          style={{ border: "1px solid var(--line)" }}
        />
      </Field>

      <Field label="Telefone">
        <input
          value={patientPhone}
          onChange={(e) => setPatientPhone(e.target.value)}
          className="w-full rounded-lg px-3 py-2 text-sm outline-none"
          style={{ border: "1px solid var(--line)" }}
        />
      </Field>

      <Field label="Observações">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="Ex: cliente pediu pra ligar antes"
          className="w-full rounded-lg px-3 py-2 text-sm outline-none resize-none"
          style={{ border: "1px solid var(--line)" }}
        />
      </Field>

      {error && (
        <p className="text-sm" style={{ color: "var(--amber)" }}>
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="flex-1 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-60"
          style={{ background: "var(--teal)" }}
        >
          {saving ? "Salvando..." : "Salvar"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded-lg text-sm"
          style={{ border: "1px solid var(--line)", color: "var(--ink)" }}
        >
          Voltar
        </button>
      </div>
    </form>
  );
}

function RescheduleForm({
  full,
  professionals,
  servicesByProfessional,
  onCancel,
  onSaved,
}: {
  full: FullAppointment;
  professionals?: ProfessionalOption[];
  servicesByProfessional?: Record<string, ServiceOption[]>;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const currentStart = new Date(full.startAt);
  const [professionalId, setProfessionalId] = useState(full.professionalId);
  const [dateYmd, setDateYmd] = useState(format(currentStart, "yyyy-MM-dd"));
  const [time, setTime] = useState(format(currentStart, "HH:mm"));
  const [availableTimes, setAvailableTimes] = useState<string[]>([]);
  const [loadingTimes, setLoadingTimes] = useState(false);
  const [status, setStatus] = useState<SlotStatus>({ state: "idle" });
  const [confirmOutsideHours, setConfirmOutsideHours] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canChangeProfessional = !!professionals && professionals.length > 1;

  // O instante escolhido, montado no fuso local (o navegador do usuário está no Brasil)
  const chosenStart = (() => {
    const [y, m, d] = dateYmd.split("-").map(Number);
    const [hh, mm] = time.split(":").map(Number);
    return new Date(y, m - 1, d, hh, mm);
  })();

  // Sugestões de horário livre naquele dia (ignorando este próprio agendamento)
  useEffect(() => {
    if (!full.serviceId) return;
    let cancelled = false;
    setLoadingTimes(true);
    fetch(
      `/api/professionals/${professionalId}/available-times?serviceId=${full.serviceId}&date=${dateYmd}&excludeAppointmentId=${full.id}`
    )
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setAvailableTimes(data.availableStartTimes ?? []);
      })
      .catch(() => {
        if (!cancelled) setAvailableTimes([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingTimes(false);
      });
    return () => {
      cancelled = true;
    };
  }, [professionalId, dateYmd, full.serviceId, full.id]);

  // Validação do horário escolhido, ao vivo
  useEffect(() => {
    if (!full.serviceId) {
      setStatus({ state: "idle" });
      return;
    }
    let cancelled = false;
    setStatus({ state: "checking" });
    setConfirmOutsideHours(false);
    fetch(
      `/api/professionals/${professionalId}/check-slot?serviceId=${full.serviceId}&startAt=${encodeURIComponent(
        chosenStart.toISOString()
      )}&excludeAppointmentId=${full.id}`
    )
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setStatus(data.ok ? { state: "ok" } : { state: (data.issue ?? "conflict") as SlotStatus["state"] });
      })
      .catch(() => {
        if (!cancelled) setStatus({ state: "idle" });
      });
    return () => {
      cancelled = true;
    };
    // chosenStart é derivado de dateYmd + time
  }, [professionalId, dateYmd, time, full.serviceId, full.id]);

  const blocked = status.state === "conflict" || status.state === "past" || status.state === "not_offered";
  const needsConfirm = status.state === "outside_hours";
  const canSubmit = !saving && !blocked && (!needsConfirm || confirmOutsideHours);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const res = await fetch(`/api/appointments/${full.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        startAt: chosenStart.toISOString(),
        professionalId,
        allowOutsideHours: confirmOutsideHours,
      }),
    });

    setSaving(false);
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Não foi possível reagendar.");
      return;
    }
    onSaved();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
        Atualmente: {format(currentStart, "dd/MM/yyyy 'às' HH:mm")} · {full.professionalName}
      </p>

      {canChangeProfessional && (
        <Field label="Profissional">
          <select
            value={professionalId}
            onChange={(e) => setProfessionalId(e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-sm outline-none"
            style={{ border: "1px solid var(--line)" }}
          >
            {professionals!.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Data">
          <input
            type="date"
            value={dateYmd}
            onChange={(e) => setDateYmd(e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-sm outline-none"
            style={{ border: "1px solid var(--line)" }}
          />
        </Field>
        <Field label="Horário">
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-sm outline-none"
            style={{ border: "1px solid var(--line)" }}
          />
        </Field>
      </div>

      {/* Atalhos: horários que sabidamente cabem nesse dia */}
      <div>
        <p className="text-xs mb-1.5" style={{ color: "var(--ink-soft)" }}>
          {loadingTimes
            ? "Buscando horários livres..."
            : availableTimes.length > 0
              ? "Horários livres nesse dia:"
              : "Nenhum horário livre nesse dia (dá pra escolher um manualmente acima)."}
        </p>
        {availableTimes.length > 0 && (
          <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
            {availableTimes.map((iso) => {
              const label = format(new Date(iso), "HH:mm");
              const selected = label === time;
              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => setTime(label)}
                  className="px-2.5 py-1 rounded-lg text-xs font-medium"
                  style={{
                    background: selected ? "var(--teal)" : "var(--surface)",
                    color: selected ? "#fff" : "var(--ink)",
                    border: "1px solid var(--line)",
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <SlotFeedback
        status={status}
        confirmOutsideHours={confirmOutsideHours}
        onToggleConfirm={setConfirmOutsideHours}
      />

      {error && (
        <p className="text-sm" style={{ color: "var(--amber)" }}>
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={!canSubmit}
          className="flex-1 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
          style={{ background: needsConfirm ? "var(--amber)" : "var(--teal)" }}
        >
          {saving ? "Reagendando..." : needsConfirm ? "Reagendar mesmo assim" : "Confirmar novo horário"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded-lg text-sm"
          style={{ border: "1px solid var(--line)", color: "var(--ink)" }}
        >
          Voltar
        </button>
      </div>
    </form>
  );
}

function InfoLine({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <span className="flex-shrink-0" style={{ color: "var(--ink-soft)", minWidth: 82 }}>
        {label}
      </span>
      <span style={{ color: "var(--ink)" }}>{children}</span>
    </div>
  );
}

function ActionButton({
  onClick,
  disabled,
  color,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="px-3.5 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-60"
      style={{ background: color }}
    >
      {children}
    </button>
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

function ModalShell({
  title,
  children,
  onClose,
  wide,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(22, 38, 43, 0.4)" }}
      onClick={onClose}
    >
      <div
        className={`rounded-2xl p-6 w-full ${wide ? "max-w-md" : "max-w-sm"} max-h-[90vh] overflow-y-auto`}
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
