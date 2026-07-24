"use client";

import { format } from "date-fns";

export interface CalendarAppointment {
  id: string;
  patientName: string;
  startAt: string; // ISO
  endAt: string; // ISO
  status: string;
}

export interface CalendarColumn {
  id: string;
  label: string;
  color: string;
  appointments: CalendarAppointment[];
}

const STATUS_STYLE: Record<string, { bg: string; border: string }> = {
  SCHEDULED: { bg: "color-mix(in srgb, var(--teal) 15%, white)", border: "var(--teal)" },
  CONFIRMED: { bg: "color-mix(in srgb, var(--teal-deep) 15%, white)", border: "var(--teal-deep)" },
  COMPLETED: { bg: "color-mix(in srgb, var(--sage) 25%, white)", border: "var(--sage)" },
  CANCELLED: { bg: "color-mix(in srgb, var(--amber) 12%, white)", border: "var(--amber)" },
  NO_SHOW: { bg: "color-mix(in srgb, var(--amber) 12%, white)", border: "var(--amber)" },
};

/**
 * Grade de calendário de um dia. `startHour`/`endHour` definem o intervalo visível
 * (ex: 7 às 20h). Cada `CalendarColumn` vira uma coluna - use uma coluna só pra
 * agenda individual, ou uma por profissional pra visão em grupo.
 *
 * Interativo: clicar num espaço vazio dispara `onSlotClick` (pra criar um
 * agendamento naquele horário); clicar num agendamento existente dispara
 * `onAppointmentClick` (pra ver detalhes/cancelar). Ambos são opcionais -
 * sem eles, o calendário funciona só como visualização.
 */
export function CalendarGrid({
  date,
  startHour = 7,
  endHour = 20,
  slotMinutes = 15,
  columns,
  onSlotClick,
  onAppointmentClick,
}: {
  date: Date;
  startHour?: number;
  endHour?: number;
  slotMinutes?: number;
  columns: CalendarColumn[];
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

  function dateForSlot(slotIdx: number) {
    const d = new Date(date);
    const totalMinutes = startHour * 60 + slotIdx * slotMinutes;
    d.setHours(0, 0, 0, 0);
    d.setMinutes(totalMinutes);
    return d;
  }

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ border: "1px solid var(--line)", background: "var(--surface-card)" }}
    >
      {/* Cabeçalho com o nome de cada coluna */}
      <div
        className="grid"
        style={{ gridTemplateColumns: `60px repeat(${columns.length}, 1fr)`, borderBottom: "1px solid var(--line)" }}
      >
        <div />
        {columns.map((col) => (
          <div key={col.id} className="px-3 py-2.5 flex items-center gap-2" style={{ borderLeft: "1px solid var(--line)" }}>
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: col.color }} />
            <span className="text-sm font-medium truncate" style={{ color: "var(--ink)" }}>
              {col.label}
            </span>
          </div>
        ))}
      </div>

      {/* Corpo da grade */}
      <div
        className="grid relative"
        style={{
          gridTemplateColumns: `60px repeat(${columns.length}, 1fr)`,
          gridTemplateRows: `repeat(${totalSlots}, 22px)`,
        }}
      >
        {/* Linhas de hora (rótulos) */}
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

        {/* Camada clicável: uma célula por slot (ex: 15min) em cada coluna - é
            aqui que o clique pra CRIAR um agendamento acontece */}
        {columns.map((col, colIdx) =>
          Array.from({ length: totalSlots }, (_, slotIdx) => {
            const isHourLine = (slotIdx * slotMinutes) % 60 === 0;
            return (
              <button
                key={`${col.id}-${slotIdx}`}
                type="button"
                onClick={() => onSlotClick?.(col.id, dateForSlot(slotIdx))}
                className="text-left"
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
                aria-label={`Novo horário às ${format(dateForSlot(slotIdx), "HH:mm")}`}
              />
            );
          })
        )}

        {/* Agendamentos (renderizados por cima da camada clicável) */}
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
                className="rounded-md px-2 py-1 overflow-hidden mx-0.5 my-px text-left"
                style={{
                  gridColumn: colIdx + 2,
                  gridRow: `${start + 1} / ${end + 1}`,
                  background: style.bg,
                  borderLeft: `3px solid ${style.border}`,
                  cursor: onAppointmentClick ? "pointer" : "default",
                }}
                title={`${a.patientName} · ${format(new Date(a.startAt), "HH:mm")}–${format(new Date(a.endAt), "HH:mm")}`}
              >
                <p className="text-xs font-medium truncate" style={{ color: "var(--ink)" }}>
                  {a.patientName}
                </p>
                <p className="text-[10px] truncate" style={{ color: "var(--ink-soft)" }}>
                  {format(new Date(a.startAt), "HH:mm")}
                </p>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}