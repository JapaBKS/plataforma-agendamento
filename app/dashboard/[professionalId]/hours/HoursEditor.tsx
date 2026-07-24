"use client";

import { useState } from "react";

const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

type Slot = { weekday: number; startTime: string; endTime: string; stepMinutes: number };

type DayState = { weekday: number; closed: boolean; startTime: string; endTime: string; stepMinutes: number };

function buildInitialDays(slots: Slot[]): DayState[] {
  return Array.from({ length: 7 }, (_, weekday) => {
    const existing = slots.find((s) => s.weekday === weekday);
    return existing
      ? { weekday, closed: false, startTime: existing.startTime, endTime: existing.endTime, stepMinutes: existing.stepMinutes }
      : { weekday, closed: true, startTime: "08:00", endTime: "18:00", stepMinutes: 15 };
  });
}

export function HoursEditor({ professionalId, initialSlots }: { professionalId: string; initialSlots: Slot[] }) {
  const [days, setDays] = useState<DayState[]>(buildInitialDays(initialSlots));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateDay(weekday: number, patch: Partial<DayState>) {
    setDays((prev) => prev.map((d) => (d.weekday === weekday ? { ...d, ...patch } : d)));
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/professionals/${professionalId}/availability`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ days }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Não foi possível salvar.");
      return;
    }
    setSaved(true);
  }

  return (
    <div className="space-y-3">
      {days.map((day) => (
        <div
          key={day.weekday}
          className="rounded-2xl p-4 flex flex-wrap items-center gap-3"
          style={{ background: "var(--surface-card)", border: "1px solid var(--line)" }}
        >
          <label className="flex items-center gap-2 w-32">
            <input
              type="checkbox"
              checked={!day.closed}
              onChange={(e) => updateDay(day.weekday, { closed: !e.target.checked })}
              className="w-4 h-4"
            />
            <span className="text-sm font-medium" style={{ color: "var(--ink)" }}>
              {WEEKDAYS[day.weekday]}
            </span>
          </label>

          {!day.closed ? (
            <>
              <input
                type="time"
                value={day.startTime}
                onChange={(e) => updateDay(day.weekday, { startTime: e.target.value })}
                className="rounded-lg px-2 py-1.5 text-sm outline-none"
                style={{ border: "1px solid var(--line)" }}
              />
              <span className="text-sm" style={{ color: "var(--ink-soft)" }}>
                até
              </span>
              <input
                type="time"
                value={day.endTime}
                onChange={(e) => updateDay(day.weekday, { endTime: e.target.value })}
                className="rounded-lg px-2 py-1.5 text-sm outline-none"
                style={{ border: "1px solid var(--line)" }}
              />
              <select
                value={day.stepMinutes}
                onChange={(e) => updateDay(day.weekday, { stepMinutes: Number(e.target.value) })}
                className="rounded-lg px-2 py-1.5 text-sm outline-none ml-auto"
                style={{ border: "1px solid var(--line)" }}
                title="De quanto em quanto tempo sugerir um horário de início"
              >
                <option value={10}>a cada 10 min</option>
                <option value={15}>a cada 15 min</option>
                <option value={30}>a cada 30 min</option>
              </select>
            </>
          ) : (
            <span className="text-sm" style={{ color: "var(--ink-soft)" }}>
              Fechado
            </span>
          )}
        </div>
      ))}

      {error && (
        <p className="text-sm" style={{ color: "var(--amber)" }}>
          {error}
        </p>
      )}

      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-60"
          style={{ background: "var(--teal)" }}
        >
          {saving ? "Salvando..." : "Salvar horário"}
        </button>
        {saved && (
          <span className="text-sm" style={{ color: "var(--teal)" }}>
            Salvo com sucesso
          </span>
        )}
      </div>
    </div>
  );
}
