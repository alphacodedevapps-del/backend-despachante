/**
 * Semáforo de situação: verde = em dia, amarelo = atenção, vermelho = atrasado.
 * Usado em listas, dashboard e barras de progresso.
 */
export type Tone = "success" | "warning" | "danger" | "info" | "primary" | "neutral";

/** Situações em que o item já foi concluído (não há mais prazo a cumprir). */
export const DONE_STATUSES = new Set([
  "concluida", "concluido", "realizada", "realizado", "estudado", "lido", "validada", "ativo_pago",
  "cancelada", "cancelado", "encerrado", "arquivado", "rejeitada", "recusado",
]);

const DAY = 86_400_000;

/** Tom pelo prazo: vermelho se passou, amarelo se faltam até 3 dias, verde se está em dia. */
export function deadlineTone(due: string | null | undefined, status?: string | null, now: number = Date.now()): Tone {
  if (status && DONE_STATUSES.has(status)) return "success";
  if (!due) return "neutral";
  const t = new Date(due.length === 10 ? `${due}T23:59:59` : due).getTime();
  if (Number.isNaN(t)) return "neutral";
  const diff = t - now;
  if (diff < 0) return "danger";
  if (diff < 3 * DAY) return "warning";
  return "success";
}

/** Tom pelo progresso: vermelho < 30%, amarelo < 70%, verde a partir de 70%. */
export function progressTone(pct: number | null | undefined): Tone {
  const v = Math.max(0, Math.min(100, Number(pct) || 0));
  if (v < 30) return "danger";
  if (v < 70) return "warning";
  return "success";
}

export const TONE_TEXT: Record<Tone, string> = {
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  info: "text-info",
  primary: "text-primary",
  neutral: "text-muted-foreground",
};

export const TONE_BG: Record<Tone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
  primary: "bg-primary",
  neutral: "bg-muted-foreground",
};

export const TONE_SOFT: Record<Tone, string> = {
  success: "bg-success-soft",
  warning: "bg-warning-soft",
  danger: "bg-danger-soft",
  info: "bg-info-soft",
  primary: "bg-primary-soft",
  neutral: "bg-surface-muted",
};

export const TONE_BORDER: Record<Tone, string> = {
  success: "border-l-success",
  warning: "border-l-warning",
  danger: "border-l-danger",
  info: "border-l-info",
  primary: "border-l-primary",
  neutral: "border-l-transparent",
};

export const DEADLINE_LEGEND = [
  { tone: "success" as const, label: "Em dia" },
  { tone: "warning" as const, label: "Vence em até 3 dias" },
  { tone: "danger" as const, label: "Atrasado" },
];
