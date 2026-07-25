"use client";

import { format } from "date-fns";

export interface CalendarAppointment {
  id: string;
  patientName: string;
  sublabel?: string;
  startAt: string; // ISO
  endAt: string; // ISO
  status: string;
  accentColor?: string;
}

/** Faixa de expediente, em "HH:mm" */
export interface WorkingRange {
  start: string;
  end: string;
}

export interface CalendarColumn {
  id: string;
  label: string;
  sublabel?: string;
  color: string;
  isToday?: boolean;
  appointments: CalendarAppointment[];
  /** undefined = sem restrição (tudo liberado); [] = fechado nesse dia */
  workingRanges?: WorkingRange[];
}

const STATUS_STYLE: Record<string, { bg: string; border: string }> = {
  SCHEDULED: { bg: "color-mix(in srgb, var(--teal) 15%, white)", border: "var(--teal)" },
  CONFIRMED: { bg: "color-mix(in srgb, var(--teal-deep) 15%, white)", border: "var(--teal-deep)" },
  COMPLETED: { bg: "color-mix(in srgb, var(--sage) 25%, white)", border: "var(--sage)" },
  CANCELLED: { bg: "color-mix(in srgb, var(--amber) 12%, white)", border: "var(--amber)" },
  NO_SHOW: { bg: "color-mix(in srgb, var(--amber) 12%, white)", border: "var(--amber)" },
};

function toMinutes(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Calcula a faixa de horas que vale a pena exibir a partir dos expedientes
 * informados - evita mostrar um monte de horário morto fora do funcionamento.
 */
export function computeHourRange(ranges: WorkingRange[], fallback = { start: 8, end: 18 }) {
  if (!ranges.length) return fallback;
  const minStart = Math.min(...ranges.map((r) => toMinutes(r.start)));
  const maxEnd = Math.max(...ranges.map((r) => toMinutes(r.end)));
  return {
    start: Math.floor(minStart / 60),
    end: Math.ceil(maxEnd / 60),
  };
}

export function CalendarGrid({
  startHour = 7,
  endHour = 20,
  slotMinutes = 15,
  columns,
  columnDates,
  onSlotClick,
  onAppointmentClick,
}: {
  startHour?: number;
  endHour?: number;
  slotMinutes?: number;
  columns: CalendarColumn[];
  columnDates: Date[];
  onSlotClick?: (columnId: string, start: Date) => void;
  onAppointmentClick?: (appointment: CalendarAppointment, columnId: string) => void;
}) {
  const totalSlots = ((endHour - startHour) * 60) / slotMinutes;
  const hourLines = Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i);

  function slotIndexFor(iso: string) {
    const d = new Date(iso);
    const minutesFromStart = (d.getHours() - startHour) * 60 + d.getMinutes();
    return Math.round(minutesFromStart / slotMinutes);
  }

  function dateForSlot(colIdx: number, slotIdx: number) {
    const d = new Date(columnDates[colIdx]);
    const totalMinutes = startHour * 60 + slotIdx * slotMinutes;
    d.setHours(0, 0, 0, 0);
    d.setMinutes(totalMinutes);
    return d;
  }

  /** O slot cai dentro do expediente daquela coluna? */
  function isWorkingSlot(col: CalendarColumn, slotIdx: number) {
    if (col.workingRanges === undefined) return true; // sem config = libera
    const slotStart = startHour * 60 + slotIdx * slotMinutes;
    const slotEnd = slotStart + slotMinutes;
    return col.workingRanges.some((r) => slotStart >= toMinutes(r.start) && slotEnd <= toMinutes(r.end));
  }

  const gridCols = `56px repeat(${columns.length}, minmax(0, 1fr))`;

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ border: "1px solid var(--line)", background: "var(--surface-card)" }}
    >
      <div className="grid" style={{ gridTemplateColumns: gridCols, borderBottom: "1px solid var(--line)" }}>
        <div />
        {columns.map((col) => (
          <div key={col.id} className="px-3 py-2.5" style={{ borderLeft: "1px solid var(--line)" }}>
            {col.sublabel ? (
              <>
                <p
                  className="font-display text-2xl font-semibold leading-none"
                  style={{ color: col.isToday ? "var(--teal)" : "var(--ink)" }}
                >
                  {col.label}
                </p>
                <p className="text-xs mt-1" style={{ color: col.isToday ? "var(--teal)" : "var(--ink-soft)" }}>
                  {col.sublabel}
                </p>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: col.color }} />
                <span className="text-sm font-medium truncate" style={{ color: "var(--ink)" }}>
                  {col.label}
                </span>
              </div>
            )}
          </div>
        ))}
      </div>

      <div
        className="grid relative"
        style={{ gridTemplateColumns: gridCols, gridTemplateRows: `repeat(${totalSlots}, 22px)` }}
      >
        {hourLines.map((h, i) => (
          <div
            key={h}
            className="text-xs text-right pr-2 -mt-2"
            style={{
              gridColumn: 1,
              gridRow: `${(i * 60) / slotMinutes + 1} / span 1`,
              color: "var(--ink-soft)",
            }}
          >
            {String(h).padStart(2, "0")}:00
          </div>
        ))}

        {columns.map((col, colIdx) =>
          Array.from({ length: totalSlots }, (_, slotIdx) => {
            const isHourLine = (slotIdx * slotMinutes) % 60 === 0;
            const working = isWorkingSlot(col, slotIdx);
            const clickable = working && !!onSlotClick;
            return (
              <button
                key={`${col.id}-${slotIdx}`}
                type="button"
                disabled={!clickable}
                onClick={() => clickable && onSlotClick!(col.id, dateForSlot(colIdx, slotIdx))}
                style={{
                  gridColumn: colIdx + 2,
                  gridRow: `${slotIdx + 1} / span 1`,
                  borderTop: isHourLine ? "1px solid var(--line)" : "1px solid transparent",
                  cursor: clickable ? "pointer" : "default",
                  background: working ? "transparent" : "color-mix(in srgb, var(--ink) 5%, transparent)",
                }}
                onMouseEnter={(e) => {
                  if (clickable) e.currentTarget.style.background = "color-mix(in srgb, var(--teal) 8%, transparent)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = working
                    ? "transparent"
                    : "color-mix(in srgb, var(--ink) 5%, transparent)";
                }}
                aria-label={
                  working
                    ? `Novo horário às ${format(dateForSlot(colIdx, slotIdx), "dd/MM HH:mm")}`
                    : "Fora do horário de funcionamento"
                }
              />
            );
          })
        )}

        {columns.map((col, colIdx) => (
          <div
            key={`sep-${col.id}`}
            className="pointer-events-none"
            style={{
              gridColumn: colIdx + 2,
              gridRow: `1 / ${totalSlots + 1}`,
              borderLeft: "1px solid var(--line)",
            }}
          />
        ))}

        {columns.map((col, colIdx) =>
          col.appointments.map((a) => {
            const start = slotIndexFor(a.startAt);
            const end = Math.max(slotIndexFor(a.endAt), start + 1);
            const style = STATUS_STYLE[a.status] ?? STATUS_STYLE.SCHEDULED;
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => onAppointmentClick?.(a, col.id)}
                className="rounded-md px-2 py-1 overflow-hidden mx-1 my-px text-left"
                style={{
                  gridColumn: colIdx + 2,
                  gridRow: `${start + 1} / ${end + 1}`,
                  background: style.bg,
                  borderLeft: `3px solid ${a.accentColor ?? style.border}`,
                  cursor: onAppointmentClick ? "pointer" : "default",
                }}
                title={`${a.patientName}${a.sublabel ? ` · ${a.sublabel}` : ""} · ${format(new Date(a.startAt), "HH:mm")}–${format(new Date(a.endAt), "HH:mm")}`}
              >
                <p className="text-xs font-medium truncate leading-tight" style={{ color: "var(--ink)" }}>
                  {a.patientName}
                </p>
                <p className="text-[10px] truncate leading-tight" style={{ color: "var(--ink-soft)" }}>
                  {a.sublabel ?? format(new Date(a.startAt), "HH:mm")}
                </p>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
