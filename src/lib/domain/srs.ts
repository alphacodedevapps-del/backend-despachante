/**
 * Revisão espaçada (variação configurável do algoritmo SM-2).
 * Avaliações: errei (0), difícil (1), bom (2), fácil (3).
 */

export type Rating = "errei" | "dificil" | "bom" | "facil";

export interface SrsSettings {
  initial_ease: number;
  min_ease: number;
  easy_bonus: number;
  hard_interval_factor: number;
  max_interval_days: number;
  first_intervals: [number, number];
}

export const DEFAULT_SRS: SrsSettings = {
  initial_ease: 2.5,
  min_ease: 1.3,
  easy_bonus: 1.3,
  hard_interval_factor: 1.2,
  max_interval_days: 365,
  first_intervals: [1, 6],
};

export interface CardState {
  ease_factor: number;
  interval_days: number;
  repetitions_count: number;
}

export interface ReviewOutcome extends CardState {
  next_review_at: Date;
  was_correct: boolean;
}

export function resolveSrsSettings(raw: unknown): SrsSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<keyof SrsSettings, unknown>>;
  const num = (v: unknown, d: number, min: number, max: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d;
  };
  const fi = Array.isArray(r.first_intervals) ? r.first_intervals : DEFAULT_SRS.first_intervals;
  return {
    initial_ease: num(r.initial_ease, DEFAULT_SRS.initial_ease, 1.3, 4),
    min_ease: num(r.min_ease, DEFAULT_SRS.min_ease, 1.1, 2.5),
    easy_bonus: num(r.easy_bonus, DEFAULT_SRS.easy_bonus, 1, 3),
    hard_interval_factor: num(r.hard_interval_factor, DEFAULT_SRS.hard_interval_factor, 1, 2),
    max_interval_days: num(r.max_interval_days, DEFAULT_SRS.max_interval_days, 7, 3650),
    first_intervals: [num(fi[0], 1, 1, 30), num(fi[1], 6, 1, 90)],
  };
}

export function reviewCard(card: CardState, rating: Rating, settings: SrsSettings = DEFAULT_SRS, now: Date = new Date()): ReviewOutcome {
  const q = { errei: 0, dificil: 1, bom: 2, facil: 3 }[rating];
  // Ajuste de facilidade inspirado no SM-2 (q mapeado para escala 0–5).
  const q5 = [1, 3, 4, 5][q];
  let ease = card.ease_factor + (0.1 - (5 - q5) * (0.08 + (5 - q5) * 0.02));
  ease = Math.max(settings.min_ease, Math.round(ease * 100) / 100);

  let reps = card.repetitions_count;
  let interval: number;

  if (rating === "errei") {
    reps = 0;
    interval = 0; // revisar novamente hoje
  } else {
    reps += 1;
    if (reps === 1) interval = settings.first_intervals[0];
    else if (reps === 2) interval = settings.first_intervals[1];
    else interval = Math.round(Math.max(1, card.interval_days) * ease);

    if (rating === "dificil") interval = Math.max(1, Math.round(Math.max(1, card.interval_days) * settings.hard_interval_factor));
    if (rating === "facil") interval = Math.round(interval * settings.easy_bonus);
    interval = Math.min(settings.max_interval_days, Math.max(1, interval));
  }

  const next = new Date(now.getTime());
  if (interval === 0) next.setMinutes(next.getMinutes() + 10);
  else next.setDate(next.getDate() + interval);

  return { ease_factor: ease, interval_days: interval, repetitions_count: reps, next_review_at: next, was_correct: rating !== "errei" };
}
