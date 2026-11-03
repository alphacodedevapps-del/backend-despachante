/** Expansão de eventos recorrentes (diária, semanal, mensal) em um intervalo. */

export interface RecurringEvent {
  id: string;
  start_at: string;
  end_at: string | null;
  recurrence: string | null;
  recurrence_until: string | null;
}

export interface Occurrence<T> {
  event: T;
  start: Date;
  end: Date | null;
  /** Chave única da ocorrência. */
  key: string;
}

const MAX_OCCURRENCES = 1000;

function addInterval(d: Date, recurrence: string, n: number): Date {
  const x = new Date(d.getTime());
  if (recurrence === "diaria") x.setDate(x.getDate() + n);
  else if (recurrence === "semanal") x.setDate(x.getDate() + 7 * n);
  else if (recurrence === "mensal") {
    const day = x.getDate();
    x.setDate(1);
    x.setMonth(x.getMonth() + n);
    const last = new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate();
    x.setDate(Math.min(day, last));
  }
  return x;
}

export function expandOccurrences<T extends RecurringEvent>(events: T[], rangeStart: Date, rangeEnd: Date): Occurrence<T>[] {
  const out: Occurrence<T>[] = [];
  for (const ev of events) {
    const start = new Date(ev.start_at);
    if (Number.isNaN(start.getTime())) continue;
    const end = ev.end_at ? new Date(ev.end_at) : null;
    const duration = end ? end.getTime() - start.getTime() : 0;
    const rec = ev.recurrence ?? "nenhuma";

    if (rec === "nenhuma" || !["diaria", "semanal", "mensal"].includes(rec)) {
      const effEnd = end ?? start;
      if (effEnd >= rangeStart && start <= rangeEnd) out.push({ event: ev, start, end, key: ev.id });
      continue;
    }

    const until = ev.recurrence_until ? new Date(`${ev.recurrence_until}T23:59:59`) : null;
    const limit = until && until < rangeEnd ? until : rangeEnd;
    // Avança rapidamente até perto do início do intervalo (eventos diários/semanais).
    let n = 0;
    if (start < rangeStart && rec !== "mensal") {
      const step = rec === "diaria" ? 86400000 : 7 * 86400000;
      n = Math.max(0, Math.floor((rangeStart.getTime() - start.getTime() - duration) / step) - 1);
    }
    let count = 0;
    for (let cur = addInterval(start, rec, n); cur <= limit && count < MAX_OCCURRENCES; n++, cur = addInterval(start, rec, n)) {
      count++;
      const curEnd = end ? new Date(cur.getTime() + duration) : null;
      if ((curEnd ?? cur) >= rangeStart) out.push({ event: ev, start: cur, end: curEnd, key: `${ev.id}:${cur.toISOString()}` });
    }
  }
  return out.sort((a, b) => a.start.getTime() - b.start.getTime());
}
