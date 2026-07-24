import { prisma } from "@/lib/prisma";
import { addMinutes, startOfDay, endOfDay } from "date-fns";

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
  tenantId?: string
): Promise<TimeWindow[]> {
  const weekday = date.getDay();
  const dayStart = startOfDay(date);
  const dayEnd = endOfDay(date);

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
      where: { professionalId, startAt: { gte: dayStart, lte: dayEnd }, status: { not: "CANCELLED" } },
    }),
  ]);

  // Janelas "base" a partir da grade de trabalho (podem ser várias, ex: manhã e tarde)
  const baseWindows: TimeWindow[] = availabilitySlots.map((slot) => {
    const [startH, startM] = slot.startTime.split(":").map(Number);
    const [endH, endM] = slot.endTime.split(":").map(Number);
    const start = new Date(date);
    start.setHours(startH, startM, 0, 0);
    const end = new Date(date);
    end.setHours(endH, endM, 0, 0);
    return { start, end };
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
  tenantId?: string
): Promise<Date[]> {
  const windows = await getFreeWindows(professionalId, date, tenantId);

  // Passo de sugestão (de quanto em quanto tempo oferecer um horário) - usa o
  // menor `stepMinutes` configurado pro profissional naquele dia, com 15min de padrão.
  const availabilitySlots = await prisma.availabilitySlot.findMany({
    where: { professionalId, weekday: date.getDay() },
  });
  const stepMin = availabilitySlots.length
    ? Math.min(...availabilitySlots.map((s) => s.stepMinutes))
    : 15;

  const starts: Date[] = [];
  for (const w of windows) {
    let cursor = w.start;
    while (addMinutes(cursor, durationMin) <= w.end) {
      starts.push(cursor);
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
