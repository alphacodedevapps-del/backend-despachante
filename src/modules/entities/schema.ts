import { z } from "zod";
import type { EntityDef, FieldDef } from "./definitions";

/**
 * Validação genérica das entidades, compartilhada entre cliente (React Hook
 * Form) e servidor (Server Actions). O servidor SEMPRE revalida.
 */

const TEXT_LIMITS: Record<string, number> = {
  text: 1000,
  url: 2000,
  email: 320,
  textarea: 20000,
  longtext: 200000,
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type FormValues = Record<string, unknown>;
export type FieldErrors = Record<string, string>;

export interface ChecklistItem {
  id: string;
  title: string;
  done: boolean;
}

/** Remove caracteres de controle (exceto quebra de linha/tab) — sanitização básica. */
export function sanitizeText(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").replace(/\r\n/g, "\n");
}

function emptyToNull(v: unknown): unknown {
  if (v === undefined || v === null) return null;
  if (typeof v === "string" && v.trim() === "") return null;
  return v;
}

/** Converte valores vindos do formulário (strings) para os tipos do banco. */
export function normalizeValue(field: FieldDef, raw: unknown): unknown {
  switch (field.type) {
    case "text":
    case "textarea":
    case "longtext":
    case "url":
    case "email":
    case "select":
    case "reference":
    case "date": {
      const v = emptyToNull(raw);
      if (v === null) return null;
      const s = sanitizeText(String(v));
      return field.type === "textarea" || field.type === "longtext" ? s.trimEnd() : s.trim();
    }
    case "datetime": {
      const v = emptyToNull(raw);
      if (v === null) return null;
      const d = new Date(String(v));
      return Number.isNaN(d.getTime()) ? "invalid" : d.toISOString();
    }
    case "number":
    case "integer": {
      const v = emptyToNull(raw);
      if (v === null) return null;
      const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
      return Number.isFinite(n) ? n : Number.NaN;
    }
    case "boolean":
      return raw === true || raw === "true" || raw === "on" || raw === 1;
    case "tags": {
      const arr = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(",") : [];
      const seen = new Set<string>();
      const out: string[] = [];
      for (const item of arr) {
        const t = sanitizeText(String(item)).trim().slice(0, 60);
        const key = t.toLowerCase();
        if (t && !seen.has(key)) {
          seen.add(key);
          out.push(t);
        }
      }
      return out;
    }
    case "checklist": {
      const arr = Array.isArray(raw) ? raw : [];
      return arr
        .filter((i): i is Record<string, unknown> => typeof i === "object" && i !== null)
        .map((i, idx) => ({
          id: typeof i.id === "string" && i.id ? i.id : `s${idx}`,
          title: sanitizeText(String(i.title ?? "")).trim(),
          done: Boolean(i.done),
        }))
        .filter((i) => i.title.length > 0);
    }
    case "options": {
      const arr = Array.isArray(raw) ? raw : [];
      return arr.map((o) => sanitizeText(String(o ?? "")).trim()).filter((o) => o.length > 0);
    }
  }
}

function fieldSchema(field: FieldDef): z.ZodType {
  const req = !!field.required;
  const label = field.label;
  switch (field.type) {
    case "text":
    case "textarea":
    case "longtext": {
      const max = field.maxLength ?? TEXT_LIMITS[field.type];
      const s = z.string().max(max, `${label}: máximo de ${max} caracteres.`);
      return req ? s.min(1, `${label} é obrigatório.`) : s.nullable();
    }
    case "url": {
      const s = z
        .string()
        .max(2000)
        .regex(/^https?:\/\/[^\s]+$/i, `${label}: informe uma URL iniciando com http:// ou https://.`);
      return req ? s : s.nullable();
    }
    case "email": {
      const s = z.string().max(320).regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/, `${label}: e-mail inválido.`);
      return req ? s : s.nullable();
    }
    case "select": {
      const values = (field.options ?? []).map((o) => o.value);
      const s = z.string().refine((v) => values.includes(v), `${label}: opção inválida.`);
      return req ? s : s.nullable();
    }
    case "reference": {
      const s = z.string().regex(UUID_RE, `${label}: seleção inválida.`);
      return req ? s : s.nullable();
    }
    case "date": {
      const s = z.string().regex(DATE_RE, `${label}: data inválida.`);
      return req ? s : s.nullable();
    }
    case "datetime": {
      const s = z.string().refine((v) => v !== "invalid" && !Number.isNaN(Date.parse(v)), `${label}: data/hora inválida.`);
      return req ? s : s.nullable();
    }
    case "number":
    case "integer": {
      let n = z.number({ error: `${label}: número inválido.` }).refine((v) => !Number.isNaN(v), `${label}: número inválido.`);
      if (field.type === "integer") n = n.refine((v) => Number.isInteger(v), `${label}: use um número inteiro.`);
      if (field.min !== undefined) n = n.refine((v) => v >= field.min!, `${label}: mínimo ${field.min}.`);
      if (field.max !== undefined) n = n.refine((v) => v <= field.max!, `${label}: máximo ${field.max}.`);
      return req ? n : n.nullable();
    }
    case "boolean":
      return z.boolean();
    case "tags":
      return z.array(z.string().max(60)).max(50, `${label}: máximo de 50 itens.`);
    case "checklist":
      return z
        .array(z.object({ id: z.string().max(64), title: z.string().min(1).max(300), done: z.boolean() }))
        .max(60, `${label}: máximo de 60 etapas.`);
    case "options":
      return z.array(z.string().max(1000)).max(10, `${label}: máximo de 10 alternativas.`);
  }
}

export function buildEntitySchema(entity: EntityDef) {
  const shape: Record<string, z.ZodType> = {};
  for (const f of entity.fields) shape[f.name] = fieldSchema(f);
  return z.object(shape).superRefine((data: Record<string, unknown>, ctx) => {
    for (const f of entity.fields) {
      if (f.required && (data[f.name] === null || data[f.name] === undefined)) {
        ctx.addIssue({ code: "custom", path: [f.name], message: `${f.label} é obrigatório.` });
      }
    }
    for (const rule of entity.requires ?? []) {
      const v = data[rule.when];
      const active = rule.notEmpty ? v !== null && v !== undefined && v !== "" : v === rule.equals;
      const target = data[rule.then];
      const filled = target !== null && target !== undefined && target !== "" && target !== false;
      if (active && !filled) ctx.addIssue({ code: "custom", path: [rule.then], message: rule.message });
    }
    const refine = ENTITY_REFINEMENTS[entity.key];
    if (refine) {
      for (const issue of refine(data)) ctx.addIssue({ code: "custom", path: [issue.path], message: issue.message });
    }
  });
}

type Refinement = (data: Record<string, unknown>) => { path: string; message: string }[];

const dateOrder =
  (start: string, end: string, message: string): Refinement =>
  (d) => {
    const a = d[start];
    const b = d[end];
    if (typeof a === "string" && typeof b === "string" && b < a) return [{ path: end, message }];
    return [];
  };

/** Regras de negócio adicionais por entidade (espelham CHECKs do banco). */
const ENTITY_REFINEMENTS: Record<string, Refinement> = {
  questions: (d) => {
    if (d.question_type !== "objetiva") return [];
    const opts = Array.isArray(d.options) ? d.options : [];
    const issues: { path: string; message: string }[] = [];
    if (opts.length < 2) issues.push({ path: "options", message: "Questões objetivas precisam de pelo menos 2 alternativas." });
    const c = d.correct_option;
    if (typeof c !== "number" || c < 0 || c >= opts.length) issues.push({ path: "correct_option", message: "Indique a alternativa correta." });
    return issues;
  },
  semesters: dateOrder("start_date", "end_date", "O término deve ser posterior ao início."),
  events: dateOrder("start_at", "end_at", "O término deve ser posterior ao início."),
  projects: dateOrder("start_date", "due_date", "O prazo deve ser posterior ao início."),
  internships: dateOrder("start_date", "end_date", "O término deve ser posterior ao início."),
  league_activities: dateOrder("starts_at", "ends_at", "O término deve ser posterior ao início."),
  assessments: (d) =>
    typeof d.score === "number" && typeof d.max_score === "number" && d.score > d.max_score
      ? [{ path: "score", message: "A nota obtida não pode exceder a nota máxima." }]
      : [],
};

export function normalizeInput(entity: EntityDef, raw: FormValues): FormValues {
  const out: FormValues = {};
  for (const f of entity.fields) out[f.name] = normalizeValue(f, raw[f.name]);
  return out;
}

export type ValidationResult = { ok: true; data: FormValues } | { ok: false; errors: FieldErrors };

/** Normaliza + valida. Usado no cliente e no servidor. */
export function validateEntityInput(entity: EntityDef, raw: FormValues): ValidationResult {
  const normalized = normalizeInput(entity, raw);
  const parsed = buildEntitySchema(entity).safeParse(normalized);
  if (parsed.success) return { ok: true, data: parsed.data as FormValues };
  const errors: FieldErrors = {};
  for (const issue of parsed.error.issues) {
    const key = String(issue.path[0] ?? "_form");
    if (!errors[key]) errors[key] = issue.message;
  }
  return { ok: false, errors };
}

/** Valores iniciais do formulário (registro existente ou defaults). */
export function initialFormValues(entity: EntityDef, record?: Record<string, unknown> | null, presets?: Record<string, string>) {
  const values: FormValues = {};
  for (const f of entity.fields) {
    const v = record ? record[f.name] : undefined;
    if (v !== undefined && v !== null) {
      values[f.name] = v;
    } else if (presets && presets[f.name] !== undefined) {
      values[f.name] = f.type === "boolean" ? presets[f.name] === "true" : presets[f.name];
    } else if (f.default !== undefined) {
      values[f.name] = f.default;
    } else if (f.type === "boolean") {
      values[f.name] = false;
    } else if (f.type === "tags" || f.type === "checklist" || f.type === "options") {
      values[f.name] = [];
    } else {
      values[f.name] = "";
    }
  }
  return values;
}

/** Valida apenas os campos presentes (atualizações parciais, ex.: mudar status no Kanban). */
export function validatePartial(entity: EntityDef, patch: FormValues): ValidationResult {
  const data: FormValues = {};
  const errors: FieldErrors = {};
  for (const [key, raw] of Object.entries(patch)) {
    const field = entity.fields.find((f) => f.name === key);
    if (!field) {
      errors[key] = "Campo desconhecido.";
      continue;
    }
    const value = normalizeValue(field, raw);
    const res = fieldSchema(field).safeParse(value);
    if (!res.success) errors[key] = res.error.issues[0]?.message ?? "Valor inválido.";
    else data[key] = res.data;
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, data };
}
