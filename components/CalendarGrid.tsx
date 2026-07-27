"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import { dateToYmdBrazil, timeHHmmBrazil } from "@/lib/timezone";

/** Minutos desde a meia-noite brasileira, a partir de um instante (ISO ou Date). */
function brMinutesOfDay(d: Date): number {
  const [h, m] = timeHHmmBrazil(d).split(":").map(Number);
  return h * 60 + m;
}

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

const ROW_HEIGHT = 22; // px por slot - usado pra posicionar a linha do horário atual

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
  return { start: Math.floor(minStart / 60), end: Math.ceil(maxEnd / 60) };
}

interface Lane {
  lane: number; // posição da faixa (0 = mais à esquerda)
  lanes: number; // quantas faixas o grupo sobreposto tem no total
}

/**
 * Resolve sobreposições: quando dois ou mais agendamentos ocupam o mesmo
 * intervalo dentro da MESMA coluna (ex: dois profissionais às 10h no mesmo dia,
 * na visão semanal), eles precisam dividir a largura em vez de um cobrir o outro.
 *
 * Como funciona:
 * 1. Ordena por horário de início.
 * 2. Agrupa em "clusters" - conjuntos que se sobrepõem em cadeia.
 * 3. Dentro de cada cluster, encaixa cada agendamento na primeira faixa livre.
 *
 * O resultado é o mesmo comportamento de apps de agenda: dois compromissos
 * simultâneos ficam lado a lado, com metade da largura cada.
 */
function assignLanes(appointments: CalendarAppointment[]): Map<string, Lane> {
  const result = new Map<string, Lane>();
  const ms = (iso: string) => new Date(iso).getTime();

  const sorted = [...appointments].sort(
    (a, b) => ms(a.startAt) - ms(b.startAt) || ms(b.endAt) - ms(a.endAt)
  );

  let cluster: CalendarAppointment[] = [];
  let clusterEnd = -Infinity;

  const flushCluster = () => {
    if (!cluster.length) return;
    const laneEnds: number[] = []; // quando cada faixa fica livre
    const assigned: Array<{ id: string; lane: number }> = [];

    for (const a of cluster) {
      let lane = laneEnds.findIndex((end) => end <= ms(a.startAt));
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(0);
      }
      laneEnds[lane] = ms(a.endAt);
      assigned.push({ id: a.id, lane });
    }

    for (const { id, lane } of assigned) {
      result.set(id, { lane, lanes: laneEnds.length });
    }
    cluster = [];
    clusterEnd = -Infinity;
  };

  for (const a of sorted) {
    // Se este começa depois do fim de todo o cluster atual, o cluster fechou
    if (cluster.length && ms(a.startAt) >= clusterEnd) flushCluster();
    cluster.push(a);
    clusterEnd = Math.max(clusterEnd, ms(a.endAt));
  }
  flushCluster();

  return result;
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
  // "Agora" começa nulo e só é definido depois que o componente monta no
  // navegador. Isso evita divergência entre o HTML gerado no servidor (que roda
  // em outro instante/fuso) e o que o navegador renderiza. Atualiza a cada minuto
  // pra linha do horário atual acompanhar o relógio.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const totalSlots = ((endHour - startHour) * 60) / slotMinutes;
  const hourLines = Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i);

  // Comparação de dias sempre pela DATA BRASILEIRA, nunca pelo fuso do navegador.
  const columnYmds = columnDates.map(dateToYmdBrazil);

  // Na visão de um dia só (colunas = profissionais) todas as datas são iguais;
  // aí não faz sentido tingir "a coluna de hoje", seria o calendário inteiro.
  const hasMultipleDays = columnYmds.some((ymd) => ymd !== columnYmds[0]);

  function slotIndexFor(iso: string) {
    const minutesFromStart = brMinutesOfDay(new Date(iso)) - startHour * 60;
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

  // Posição (em px) da linha do horário atual, ou null se hoje não está visível
  const nowYmd = now ? dateToYmdBrazil(now) : null;
  const nowOffsetPx = (() => {
    if (!now || !nowYmd) return null;
    const visible = columnYmds.includes(nowYmd);
    if (!visible) return null;
    const minutesFromStart = brMinutesOfDay(now) - startHour * 60;
    if (minutesFromStart < 0 || minutesFromStart > (endHour - startHour) * 60) return null;
    return (minutesFromStart / slotMinutes) * ROW_HEIGHT;
  })();

  const gridCols = `56px repeat(${columns.length}, minmax(0, 1fr))`;

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ border: "1px solid var(--line)", background: "var(--surface-card)" }}
    >
      {/* Cabeçalho das colunas */}
      <div className="grid" style={{ gridTemplateColumns: gridCols, borderBottom: "1px solid var(--line)" }}>
        <div />
        {columns.map((col, colIdx) => {
          const columnIsToday = !!nowYmd && columnYmds[colIdx] === nowYmd;
          const highlight = columnIsToday && hasMultipleDays;
          return (
            <div
              key={col.id}
              className="px-3 py-2.5"
              style={{
                borderLeft: "1px solid var(--line)",
                background: highlight ? "color-mix(in srgb, var(--teal) 10%, transparent)" : "transparent",
                borderBottom: highlight ? "2px solid var(--teal)" : "2px solid transparent",
              }}
            >
              {col.sublabel ? (
                <div className="flex items-center gap-2">
                  {highlight ? (
                    // Dia de hoje: número dentro de um círculo cheio, como em apps de agenda
                    <span
                      className="font-display text-lg font-semibold rounded-full w-9 h-9 flex items-center justify-center"
                      style={{ background: "var(--teal)", color: "#fff" }}
                    >
                      {col.label}
                    </span>
                  ) : (
                    <span className="font-display text-2xl font-semibold leading-none" style={{ color: "var(--ink)" }}>
                      {col.label}
                    </span>
                  )}
                  <span
                    className="text-xs capitalize"
                    style={{ color: highlight ? "var(--teal)" : "var(--ink-soft)", fontWeight: highlight ? 600 : 400 }}
                  >
                    {col.sublabel}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: col.color }} />
                  <span className="text-sm font-medium truncate" style={{ color: "var(--ink)" }}>
                    {col.label}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Corpo da grade */}
      <div
        className="grid relative"
        style={{ gridTemplateColumns: gridCols, gridTemplateRows: `repeat(${totalSlots}, ${ROW_HEIGHT}px)` }}
      >
        {/* Rótulos de hora na lateral */}
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

        {/* Fundo levemente destacado na coluna de hoje (só na visão semanal) */}
        {hasMultipleDays &&
          columns.map((col, colIdx) =>
            nowYmd && columnYmds[colIdx] === nowYmd ? (
              <div
                key={`today-bg-${col.id}`}
                className="pointer-events-none"
                style={{
                  gridColumn: colIdx + 2,
                  gridRow: `1 / ${totalSlots + 1}`,
                  background: "color-mix(in srgb, var(--teal) 5%, transparent)",
                }}
              />
            ) : null
          )}

        {/* Camada clicável (uma célula por slot) */}
        {columns.map((col, colIdx) =>
          Array.from({ length: totalSlots }, (_, slotIdx) => {
            const isHourLine = (slotIdx * slotMinutes) % 60 === 0;
            const slotDate = dateForSlot(colIdx, slotIdx);
            const working = isWorkingSlot(col, slotIdx);
            // Passado: não dá pra agendar pra trás. `now` nulo (antes de montar)
            // conta como "não é passado", pra não travar nada durante o SSR.
            const isPast = !!now && slotDate.getTime() < now.getTime();
            const clickable = working && !isPast && !!onSlotClick;

            const bg = isPast
              ? "color-mix(in srgb, var(--ink) 7%, transparent)"
              : working
                ? "transparent"
                : "color-mix(in srgb, var(--ink) 5%, transparent)";

            return (
              <button
                key={`${col.id}-${slotIdx}`}
                type="button"
                disabled={!clickable}
                onClick={() => clickable && onSlotClick!(col.id, slotDate)}
                style={{
                  gridColumn: colIdx + 2,
                  gridRow: `${slotIdx + 1} / span 1`,
                  borderTop: isHourLine ? "1px solid var(--line)" : "1px solid transparent",
                  cursor: clickable ? "pointer" : "default",
                  background: bg,
                }}
                onMouseEnter={(e) => {
                  if (clickable) e.currentTarget.style.background = "color-mix(in srgb, var(--teal) 12%, transparent)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = bg;
                }}
                aria-label={
                  isPast
                    ? "Horário já passou"
                    : working
                      ? `Novo horário às ${format(slotDate, "dd/MM HH:mm")}`
                      : "Fora do horário de funcionamento"
                }
              />
            );
          })
        )}

        {/* Divisórias verticais */}
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

        {/* Agendamentos - divididos em faixas quando há sobreposição */}
        {columns.map((col, colIdx) => {
          const lanes = assignLanes(col.appointments);
          return col.appointments.map((a) => {
            const start = slotIndexFor(a.startAt);
            const end = Math.max(slotIndexFor(a.endAt), start + 1);
            const style = STATUS_STYLE[a.status] ?? STATUS_STYLE.SCHEDULED;
            const { lane, lanes: laneCount } = lanes.get(a.id) ?? { lane: 0, lanes: 1 };

            // Divide a largura da coluna entre os simultâneos. As porcentagens são
            // relativas à célula da grade, então funcionam em qualquer largura de tela.
            const widthPct = 100 / laneCount;
            const isNarrow = laneCount >= 3;

            return (
              <button
                key={a.id}
                type="button"
                onClick={() => onAppointmentClick?.(a, col.id)}
                className="rounded-md py-1 overflow-hidden my-px text-left"
                style={{
                  gridColumn: colIdx + 2,
                  gridRow: `${start + 1} / ${end + 1}`,
                  width: `calc(${widthPct}% - 4px)`,
                  marginLeft: `calc(${lane * widthPct}% + 2px)`,
                  paddingLeft: isNarrow ? 3 : 6,
                  paddingRight: isNarrow ? 2 : 6,
                  background: style.bg,
                  borderLeft: `3px solid ${a.accentColor ?? style.border}`,
                  cursor: onAppointmentClick ? "pointer" : "default",
                  zIndex: 5,
                }}
                title={`${a.patientName}${a.sublabel ? ` · ${a.sublabel}` : ""} · ${format(new Date(a.startAt), "HH:mm")}–${format(new Date(a.endAt), "HH:mm")}`}
              >
                <p className="text-xs font-medium truncate leading-tight" style={{ color: "var(--ink)" }}>
                  {a.patientName}
                </p>
                {/* Com 3+ simultâneos não cabe a segunda linha - o nome do
                    profissional segue visível no tooltip e na cor da borda */}
                {!isNarrow && (
                  <p className="text-[10px] truncate leading-tight" style={{ color: "var(--ink-soft)" }}>
                    {a.sublabel ?? format(new Date(a.startAt), "HH:mm")}
                  </p>
                )}
              </button>
            );
          });
        })}

        {/* Linha do horário atual - fica por cima de tudo */}
        {nowOffsetPx !== null && now && (
          <div
            className="pointer-events-none absolute left-0 right-0 flex items-center"
            style={{ top: `${nowOffsetPx}px`, zIndex: 20 }}
          >
            <span
              className="text-[10px] font-semibold px-1 rounded"
              style={{ background: "var(--amber)", color: "#fff", marginLeft: 2 }}
            >
              {timeHHmmBrazil(now)}
            </span>
            <span className="flex-1 h-px" style={{ background: "var(--amber)" }} />
          </div>
        )}
      </div>
    </div>
  );
}
