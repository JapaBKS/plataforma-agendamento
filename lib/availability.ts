import { prisma } from "@/lib/prisma";
import { addMinutes } from "date-fns";
import {
  dateToYmdBrazil,
  startOfDayBrazil,
  endOfDayBrazil,
  brazilWallClockToUtc,
} from "@/lib/timezone";

export interface TimeWindow {
  start: Date;
  end: Date;
}

/**
 * Calcula as janelas de tempo LIVRES e CONTÍNUAS de um profissional num dia
 * (ex: "das 09:00 às 11:30 está tudo livre"), cruzando:
 * AvailabilitySlot (grade semanal) - ScheduleBlock (bloqueios) - Appointment (ocupados).
 *
 * Isso é diferente de "fatiar o dia em blocos fixos": aqui a duração de cada
 * atendimento (vinda do Service escolhido) só entra depois, em getAvailableStartTimes.
 */
export async function getFreeWindows(
  professionalId: string,
  date: Date,
  tenantId?: string,
  /**
   * Ignora um agendamento no cálculo. Essencial ao REAGENDAR: sem isso o
   * agendamento entraria em conflito consigo mesmo e nunca poderia ser movido
   * (nem pra 10 minutos depois, nem pra outro dia).
   */
  excludeAppointmentId?: string
): Promise<TimeWindow[]> {
  // TUDO calculado no fuso do Brasil. Sem isso, num servidor UTC (Vercel) o
  // expediente "08:00-18:00" viraria 08:00-18:00 UTC = 05:00-15:00 no Brasil,
  // e qualquer atendimento após as 15h seria recusado como "fora do expediente".
  const ymd = dateToYmdBrazil(date);
  const weekday = new Date(`${ymd}T12:00:00`).getDay(); // meio-dia: seguro pra ler o dia da semana
  const dayStart = startOfDayBrazil(ymd);
  const dayEnd = endOfDayBrazil(ymd);

  // tenantId é opcional na assinatura (chamadas internas já confiam no professionalId),
  // mas sempre que disponível (ex.: vindo de uma API key do N8N) deve ser passado -
  // é a segunda camada de isolamento entre clientes da plataforma.
  const professionalFilter = tenantId ? { id: professionalId, tenantId } : { id: professionalId };
  const professionalExists = await prisma.professional.findFirst({ where: professionalFilter });
  if (!professionalExists) return [];

  const [availabilitySlots, blocks, appointments] = await Promise.all([
    prisma.availabilitySlot.findMany({ where: { professionalId, weekday } }),
    prisma.scheduleBlock.findMany({
      where: { professionalId, startAt: { lte: dayEnd }, endAt: { gte: dayStart } },
    }),
    prisma.appointment.findMany({
      where: {
        professionalId,
        startAt: { gte: dayStart, lte: dayEnd },
        status: { not: "CANCELLED" },
        ...(excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {}),
      },
    }),
  ]);

  // Janelas "base" a partir da grade de trabalho (podem ser várias, ex: manhã e tarde)
  const baseWindows: TimeWindow[] = availabilitySlots.map((slot) => {
    const [startH, startM] = slot.startTime.split(":").map(Number);
    const [endH, endM] = slot.endTime.split(":").map(Number);
    // "08:00" no cadastro significa 08:00 no Brasil, não no fuso do servidor
    return {
      start: brazilWallClockToUtc(ymd, startH, startM),
      end: brazilWallClockToUtc(ymd, endH, endM),
    };
  });

  // Tudo que ocupa tempo (bloqueios + agendamentos já feitos) vira um intervalo "ocupado"
  const busy: TimeWindow[] = [
    ...blocks.map((b) => ({ start: b.startAt, end: b.endAt })),
    ...appointments.map((a) => ({ start: a.startAt, end: a.endAt })),
  ].sort((a, b) => a.start.getTime() - b.start.getTime());

  // Subtrai os intervalos ocupados de cada janela base, gerando as janelas livres finais
  const freeWindows: TimeWindow[] = [];
  for (const base of baseWindows) {
    let cursor = base.start;
    for (const b of busy) {
      const overlapStart = b.start > cursor ? b.start : cursor;
      const overlapEnd = b.end < base.end ? b.end : base.end;
      if (overlapStart > overlapEnd) continue; // esse "ocupado" não toca essa janela
      if (overlapStart > cursor) {
        freeWindows.push({ start: cursor, end: overlapStart });
      }
      if (overlapEnd > cursor) cursor = overlapEnd;
    }
    if (cursor < base.end) {
      freeWindows.push({ start: cursor, end: base.end });
    }
  }

  return freeWindows.filter((w) => w.end > w.start);
}

/**
 * A partir das janelas livres, gera os horários de INÍCIO possíveis para um
 * atendimento de `durationMin` minutos - só entram os que cabem inteiros numa
 * janela livre, sem estourar o fim do expediente nem invadir outro agendamento.
 */
export async function getAvailableStartTimes(
  professionalId: string,
  date: Date,
  durationMin: number,
  tenantId?: string,
  excludeAppointmentId?: string
): Promise<Date[]> {
  const windows = await getFreeWindows(professionalId, date, tenantId, excludeAppointmentId);

  // Passo de sugestão (de quanto em quanto tempo oferecer um horário) - usa o
  // menor `stepMinutes` configurado pro profissional naquele dia, com 15min de padrão.
  const weekdayBr = new Date(`${dateToYmdBrazil(date)}T12:00:00`).getDay();
  const availabilitySlots = await prisma.availabilitySlot.findMany({
    where: { professionalId, weekday: weekdayBr },
  });
  const stepMin = availabilitySlots.length
    ? Math.min(...availabilitySlots.map((s) => s.stepMinutes))
    : 15;

  // Não oferece horário que já passou - senão o chatbot sugeriria "09:00" às 15h.
  // A mesma tolerância usada na criação do agendamento, pra não haver o caso
  // esquisito de um horário aparecer na lista e ser recusado ao confirmar.
  const TOLERANCIA_MIN = 5;
  const minStart = Date.now() - TOLERANCIA_MIN * 60_000;

  const starts: Date[] = [];
  for (const w of windows) {
    let cursor = w.start;
    while (addMinutes(cursor, durationMin) <= w.end) {
      if (cursor.getTime() >= minStart) starts.push(cursor);
      cursor = addMinutes(cursor, stepMin);
    }
  }
  return starts;
}

/** Confirma se um horário de início específico ainda cabe (revalidação no momento de criar o agendamento). */
export async function isStartTimeAvailable(
  professionalId: string,
  start: Date,
  durationMin: number,
  tenantId?: string
): Promise<boolean> {
  const windows = await getFreeWindows(professionalId, start, tenantId);
  const end = addMinutes(start, durationMin);
  return windows.some((w) => start >= w.start && end <= w.end);
}

export type SlotIssue = "past" | "conflict" | "outside_hours" | null;

export interface SlotCheck {
  ok: boolean;
  /**
   * Por que não dá:
   * - "past"          -> horário já passou (nunca liberado)
   * - "conflict"      -> choca com outro agendamento ou bloqueio (nunca liberado:
   *                      seria agenda dupla)
   * - "outside_hours" -> fora do expediente cadastrado, mas SEM conflito. Pode ser
   *                      liberado com confirmação explícita (atendimento de exceção).
   */
  issue: SlotIssue;
}

/**
 * Verifica um horário específico e diz QUAL é o problema, não só que existe um.
 * A distinção importa porque "fora do expediente" é uma exceção legítima que a
 * recepção pode querer forçar, enquanto "conflito" é sempre um erro.
 */
export async function checkSlot(
  professionalId: string,
  start: Date,
  durationMin: number,
  tenantId?: string,
  excludeAppointmentId?: string
): Promise<SlotCheck> {
  const end = addMinutes(start, durationMin);

  const TOLERANCIA_MIN = 5;
  if (start.getTime() < Date.now() - TOLERANCIA_MIN * 60_000) {
    return { ok: false, issue: "past" };
  }

  // Cabe dentro de alguma janela livre? Então está tudo certo.
  const windows = await getFreeWindows(professionalId, start, tenantId, excludeAppointmentId);
  if (windows.some((w) => start >= w.start && end <= w.end)) {
    return { ok: true, issue: null };
  }

  // Não cabe. Descobrir se é por causa do expediente ou de algo ocupando o horário.
  const ymd = dateToYmdBrazil(start);
  const dayStart = startOfDayBrazil(ymd);
  const dayEnd = endOfDayBrazil(ymd);
  const [blocks, appointments] = await Promise.all([
    prisma.scheduleBlock.findMany({
      where: { professionalId, startAt: { lt: end }, endAt: { gt: start } },
    }),
    prisma.appointment.findMany({
      where: {
        professionalId,
        status: { not: "CANCELLED" },
        startAt: { lt: end, gte: dayStart },
        endAt: { gt: start, lte: addMinutes(dayEnd, 1) },
        ...(excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {}),
      },
    }),
  ]);

  if (blocks.length > 0 || appointments.length > 0) {
    return { ok: false, issue: "conflict" };
  }

  // Nada ocupando: o impedimento é a grade de trabalho
  return { ok: false, issue: "outside_hours" };
}
