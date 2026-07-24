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

export interface CalendarColumn {
  id: string;
  label: string;
  sublabel?: string;
  color: string;
  isToday?: boolean;
  appointments: CalendarAppointment[];
}

const STATUS_STYLE: Record<string, { bg: string; border: string }> = {
  SCHEDULED: { bg: "color-mix(in srgb, var(--teal) 15%, white)", border: "var(--teal)" },
  CONFIRMED: { bg: "color-mix(in srgb, var(--teal-deep) 15%, white)", border: "var(--teal-deep)" },
  COMPLETED: { bg: "color-mix(in srgb, var(--sage) 25%, white)", border: "var(--sage)" },
  CANCELLED: { bg: "color-mix(in srgb, var(--amber) 12%, white)", border: "var(--amber)" },
  NO_SHOW: { bg: "color-mix(in srgb, var(--amber) 12%, white)", border: "var(--amber)" },
};

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
            return (
              <button
                key={`${col.id}-${slotIdx}`}
                type="button"
                onClick={() => onSlotClick?.(col.id, dateForSlot(colIdx, slotIdx))}
                style={{
                  gridColumn: colIdx + 2,
                  gridRow: `${slotIdx + 1} / span 1`,
                  borderTop: isHourLine ? "1px solid var(--line)" : "1px solid transparent",
                  cursor: onSlotClick ? "pointer" : "default",
                  background: "transparent",
                }}
                onMouseEnter={(e) => {
                  if (onSlotClick) e.currentTarget.style.background = "color-mix(in srgb, var(--teal) 8%, transparent)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                }}
                aria-label={`Novo horário às ${format(dateForSlot(colIdx, slotIdx), "dd/MM HH:mm")}`}
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
