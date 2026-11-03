import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { SessionContext } from "@/lib/session";
import { ENTITIES, ENTITY_MAP, type EntityDef, type EntityView } from "./definitions";

export type Row = Record<string, unknown> & { id: string; created_by: string | null; workspace_id: string; created_at: string; updated_at: string };

/** Mapa entidade → id → título (para exibir referências). */
export type RefLabels = Record<string, Record<string, string>>;

export const PAGE_SIZE = 25;

export interface ListOptions {
  q?: string;
  filters?: Record<string, string>;
  favorites?: boolean;
  page?: number;
  pageSize?: number;
  view?: EntityView | null;
  sort?: string;
}

export interface ListResult {
  rows: Row[];
  total: number;
  page: number;
  pageSize: number;
  refLabels: RefLabels;
}

/** IDs que casam com a busca textual (via índice global, acentos ignorados). */
async function searchIds(entityKey: string, workspaceId: string, q: string): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("global_search", {
    p_query: q,
    p_workspace_id: workspaceId,
    p_types: [entityKey],
    p_limit: 200,
  });
  return ((data ?? []) as { entity_id: string }[]).map((r) => r.entity_id);
}

export async function resolveRefLabels(entity: EntityDef, rows: Row[]): Promise<RefLabels> {
  const supabase = await createClient();
  const refs = entity.fields.filter((f) => f.type === "reference" && f.reference);
  const labels: RefLabels = {};
  await Promise.all(
    refs.map(async (f) => {
      const target = ENTITY_MAP[f.reference!];
      if (!target) return;
      const ids = Array.from(new Set(rows.map((r) => r[f.name]).filter((v): v is string => typeof v === "string")));
      if (!ids.length) return;
      const { data } = await supabase.from(target.key).select(`id, ${target.titleField}`).in("id", ids);
      labels[target.key] = { ...(labels[target.key] ?? {}) };
      for (const r of (data ?? []) as unknown as Record<string, unknown>[]) {
        labels[target.key][String(r.id)] = String(r[target.titleField] ?? "");
      }
    }),
  );
  return labels;
}

export async function listRecords(entity: EntityDef, ctx: SessionContext, opts: ListOptions = {}): Promise<ListResult> {
  const supabase = await createClient();
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(100, Math.max(5, opts.pageSize ?? PAGE_SIZE));

  let query = supabase.from(entity.key).select("*", { count: "exact" }).eq("workspace_id", ctx.workspace.id);

  if (opts.view) query = query.in(opts.view.filter.field, opts.view.filter.values);

  for (const [key, value] of Object.entries(opts.filters ?? {})) {
    const field = entity.fields.find((f) => f.name === key && f.filter);
    if (!field || !value) continue;
    if (field.type === "integer" || field.type === "number") {
      const n = Number(value);
      if (Number.isFinite(n)) query = query.eq(key, n);
    } else if (field.type === "select" && !(field.options ?? []).some((o) => o.value === value)) {
      continue;
    } else {
      query = query.eq(key, value.slice(0, 200));
    }
  }

  if (opts.favorites && entity.favorites) query = query.eq("is_favorite", true);

  if (opts.q && opts.q.trim().length >= 2) {
    const ids = await searchIds(entity.key, ctx.workspace.id, opts.q);
    if (ids.length === 0) return { rows: [], total: 0, page, pageSize, refLabels: {} };
    query = query.in("id", ids);
  }

  const sortable = new Set(["created_at", "updated_at", ...entity.fields.map((f) => f.name)]);
  let sortField = entity.defaultSort?.field ?? "created_at";
  let ascending = entity.defaultSort?.ascending ?? false;
  if (opts.sort) {
    const [f, dir] = opts.sort.split(".");
    if (sortable.has(f)) {
      sortField = f;
      ascending = dir !== "desc";
    }
  }
  query = query.order(sortField, { ascending, nullsFirst: false }).order("created_at", { ascending: false });
  query = query.range((page - 1) * pageSize, page * pageSize - 1);

  const { data, count, error } = await query;
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Row[];
  return { rows, total: count ?? 0, page, pageSize, refLabels: await resolveRefLabels(entity, rows) };
}

export async function getRecord(entity: EntityDef, id: string): Promise<{ row: Row; refLabels: RefLabels } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await createClient();
  const { data } = await supabase.from(entity.key).select("*").eq("id", id).maybeSingle();
  if (!data) return null;
  const row = data as Row;
  return { row, refLabels: await resolveRefLabels(entity, [row]) };
}

export interface RefOption {
  id: string;
  label: string;
}

/** Opções para campos de referência (registros do workspace atual). */
export async function referenceOptions(entityKeys: string[], workspaceId: string): Promise<Record<string, RefOption[]>> {
  const supabase = await createClient();
  const out: Record<string, RefOption[]> = {};
  await Promise.all(
    Array.from(new Set(entityKeys)).map(async (key) => {
      const target = ENTITY_MAP[key];
      if (!target) return;
      const { data } = await supabase
        .from(target.key)
        .select(`id, ${target.titleField}`)
        .eq("workspace_id", workspaceId)
        .order(target.titleField, { ascending: true })
        .limit(500);
      out[key] = ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
        id: String(r.id),
        label: String(r[target.titleField] ?? "(sem título)").slice(0, 160),
      }));
    }),
  );
  return out;
}

export interface ChildGroup {
  entity: EntityDef;
  field: string;
  rows: Row[];
  total: number;
}

/** Registros de outras entidades que referenciam este (ex.: provas de uma disciplina). */
export async function linkedChildren(entity: EntityDef, id: string): Promise<ChildGroup[]> {
  const supabase = await createClient();
  const candidates = ENTITIES.flatMap((e) =>
    e.fields.filter((f) => f.type === "reference" && f.reference === entity.key && e.key !== entity.key).map((f) => ({ e, f })),
  );
  const groups = await Promise.all(
    candidates.map(async ({ e, f }) => {
      const order = e.defaultSort ?? { field: "created_at", ascending: false };
      const { data, count } = await supabase
        .from(e.key)
        .select("*", { count: "exact" })
        .eq(f.name, id)
        .order(order.field, { ascending: order.ascending, nullsFirst: false })
        .limit(12);
      return { entity: e, field: f.name, rows: (data ?? []) as Row[], total: count ?? 0 };
    }),
  );
  return groups;
}

export function recordTitle(entity: EntityDef, row: Record<string, unknown>): string {
  const v = row[entity.titleField];
  return typeof v === "string" && v.trim() ? v : "(sem título)";
}
