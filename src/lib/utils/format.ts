import { format, formatDistanceToNowStrict, isValid, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

export const TIME_ZONE = "America/Sao_Paulo";

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return isValid(value) ? value : null;
  // Datas puras (AAAA-MM-DD) são interpretadas no fuso local, sem deslocamento.
  const d = /^\d{4}-\d{2}-\d{2}$/.test(value) ? parseISO(value) : new Date(value);
  return isValid(d) ? d : null;
}

/** DD/MM/AAAA */
export function formatDate(value: string | Date | null | undefined): string {
  const d = toDate(value);
  return d ? format(d, "dd/MM/yyyy", { locale: ptBR }) : "";
}

/** DD/MM/AAAA HH:mm */
export function formatDateTime(value: string | Date | null | undefined): string {
  const d = toDate(value);
  return d ? format(d, "dd/MM/yyyy HH:mm", { locale: ptBR }) : "";
}

export function formatTime(value: string | Date | null | undefined): string {
  const d = toDate(value);
  return d ? format(d, "HH:mm", { locale: ptBR }) : "";
}

export function formatRelative(value: string | Date | null | undefined): string {
  const d = toDate(value);
  return d ? formatDistanceToNowStrict(d, { locale: ptBR, addSuffix: true }) : "";
}

export function formatLong(value: string | Date | null | undefined, pattern = "EEEE, d 'de' MMMM"): string {
  const d = toDate(value);
  return d ? format(d, pattern, { locale: ptBR }) : "";
}

export function formatNumber(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "";
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(value);
}

export function formatCurrencyBRL(value: number | null | undefined): string {
  if (value === null || value === undefined) return "";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${formatNumber(n, i === 0 ? 0 : 1)} ${units[i]}`;
}

/** Converte valor de input datetime-local (horário local) para ISO. */
export function localInputToIso(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  return isValid(d) ? d.toISOString() : null;
}

/** Converte ISO para o formato do input datetime-local. */
export function isoToLocalInput(value: string | null | undefined): string {
  const d = toDate(value ?? null);
  return d ? format(d, "yyyy-MM-dd'T'HH:mm") : "";
}

export function initials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

export function truncate(text: string | null | undefined, max = 140): string {
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}
