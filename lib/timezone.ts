/**
 * A plataforma opera no fuso do Brasil (America/Sao_Paulo, UTC-3).
 *
 * O problema que isto resolve: o servidor da Vercel roda em UTC. Sem cuidado,
 * "início do dia 28" calculado lá vira 28/00:00 UTC = 27/21:00 no Brasil, e o
 * agendamento aparece no dia errado / o dia de "hoje" fica trocado.
 *
 * Em vez de depender de uma variável de ambiente TZ (que é fácil de esquecer ao
 * criar um ambiente novo), estas funções fixam o offset do Brasil no código.
 *
 * Observação: o Brasil não usa mais horário de verão desde 2019, então o offset
 * fixo de -3h é seguro hoje. Se o horário de verão voltar, este é o único lugar
 * que precisa mudar.
 */

const BR_OFFSET_MIN = -3 * 60; // UTC-3

/** "Que dia é hoje no Brasil", como string "yyyy-MM-dd". */
export function todayInBrazil(): string {
  return dateToYmdBrazil(new Date());
}

/** Converte um instante (Date) para a data "yyyy-MM-dd" como vista no Brasil. */
export function dateToYmdBrazil(d: Date): string {
  // desloca o horário UTC para o horário-parede do Brasil, depois lê os campos UTC
  const shifted = new Date(d.getTime() + BR_OFFSET_MIN * 60_000);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Hora "HH:mm" como vista no Brasil, a partir de um instante. */
export function timeHHmmBrazil(d: Date): string {
  const shifted = new Date(d.getTime() + BR_OFFSET_MIN * 60_000);
  const h = String(shifted.getUTCHours()).padStart(2, "0");
  const min = String(shifted.getUTCMinutes()).padStart(2, "0");
  return `${h}:${min}`;
}

/**
 * O instante UTC que corresponde a uma parede-de-relógio brasileira.
 * Ex: brazilWallClockToUtc("2026-07-28", 0, 0) -> 2026-07-28T03:00:00Z
 * Útil pra montar os limites (início/fim) de um dia brasileiro em UTC, que é
 * como o Postgres guarda os timestamps.
 */
export function brazilWallClockToUtc(ymd: string, hours = 0, minutes = 0): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  // meia-noite brasileira em UTC = meia-noite "UTC-fantasia" menos o offset
  const asUtc = Date.UTC(y, m - 1, d, hours, minutes) - BR_OFFSET_MIN * 60_000;
  return new Date(asUtc);
}

/** Início do dia (00:00 no Brasil) em UTC. */
export function startOfDayBrazil(ymd: string): Date {
  return brazilWallClockToUtc(ymd, 0, 0);
}

/** Fim do dia (23:59:59.999 no Brasil) em UTC. */
export function endOfDayBrazil(ymd: string): Date {
  return new Date(brazilWallClockToUtc(ymd, 24, 0).getTime() - 1);
}
