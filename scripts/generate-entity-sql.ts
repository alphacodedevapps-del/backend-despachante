/**
 * Gera supabase/migrations/20260101000002_entities.sql a partir de
 * src/modules/entities/definitions.ts (fonte única de verdade).
 *
 * Uso: node scripts/generate-entity-sql.ts
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { ENTITIES, type EntityDef, type FieldDef } from "../src/modules/entities/definitions.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "supabase/migrations/20260101000002_entities.sql");

const TEXT_LIMITS: Record<string, number> = {
  text: 1000,
  url: 2000,
  email: 320,
  select: 64,
  textarea: 20000,
  longtext: 200000,
};

function lit(v: string | number | boolean): string {
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return `'${v.replace(/'/g, "''")}'`;
}

function columnSql(entity: EntityDef, f: FieldDef): { col: string; checks: string[] } {
  const checks: string[] = [];
  let type: string;
  let notNull = !!f.required;
  let def: string | undefined = f.default !== undefined ? lit(f.default) : undefined;

  switch (f.type) {
    case "text":
    case "textarea":
    case "longtext":
    case "url":
    case "email":
    case "select": {
      type = "text";
      const limit = f.maxLength ?? TEXT_LIMITS[f.type];
      checks.push(`char_length(${f.name}) <= ${limit}`);
      if (f.required) checks.push(`char_length(btrim(${f.name})) > 0`);
      if (f.type === "url") checks.push(`${f.name} is null or ${f.name} ~* '^https?://'`);
      if (f.type === "email") checks.push(`${f.name} is null or ${f.name} ~* '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$'`);
      if (f.type === "select" && f.options) {
        checks.push(`${f.name} is null or ${f.name} in (${f.options.map((op) => lit(op.value)).join(", ")})`);
      }
      break;
    }
    case "number":
      type = "numeric";
      break;
    case "integer":
      type = "integer";
      break;
    case "date":
      type = "date";
      break;
    case "datetime":
      type = "timestamptz";
      break;
    case "boolean":
      type = "boolean";
      notNull = true;
      def = def ?? "false";
      break;
    case "tags":
      type = "text[]";
      notNull = true;
      def = "'{}'::text[]";
      checks.push(`cardinality(${f.name}) <= 50`);
      break;
    case "checklist":
    case "options":
      type = "jsonb";
      notNull = true;
      def = "'[]'::jsonb";
      checks.push(`jsonb_typeof(${f.name}) = 'array'`);
      break;
    case "reference":
      type = "uuid";
      break;
    default:
      throw new Error(`Tipo não suportado: ${String(f.type)} em ${entity.key}.${f.name}`);
  }

  if (f.type === "number" || f.type === "integer") {
    if (f.min !== undefined) checks.push(`${f.name} is null or ${f.name} >= ${f.min}`);
    if (f.max !== undefined) checks.push(`${f.name} is null or ${f.name} <= ${f.max}`);
  }

  const parts = [`  ${f.name} ${type}`];
  if (def !== undefined) parts.push(`default ${def}`);
  if (notNull) parts.push("not null");
  return { col: parts.join(" "), checks };
}

function entitySql(e: EntityDef): { create: string; fks: string } {
  const lines: string[] = [
    "  id uuid primary key default gen_random_uuid()",
    "  workspace_id uuid not null references public.workspaces (id) on delete cascade",
    "  created_by uuid default auth.uid() references auth.users (id) on delete set null",
  ];
  const checks: string[] = [];
  for (const f of e.fields) {
    const { col, checks: c } = columnSql(e, f);
    lines.push(col);
    c.forEach((expr, i) => checks.push(`  constraint ${e.key}_${f.name}_chk${i} check (${expr})`));
  }
  if (e.favorites) lines.push("  is_favorite boolean not null default false");
  for (const sc of e.systemColumns ?? []) lines.push(`  ${sc}`);
  lines.push("  created_at timestamptz not null default now()");
  lines.push("  updated_at timestamptz not null default now()");
  for (const [name, expr] of Object.entries(e.checks ?? {})) checks.push(`  constraint ${name} check (${expr})`);

  const refs = e.fields.filter((f) => f.type === "reference");
  const out: string[] = [];
  out.push(`-- ${e.plural} (${e.key})`);
  out.push(`create table public.${e.key} (\n${[...lines, ...checks].join(",\n")}\n);`);
  out.push(`create index ${e.key}_ws_idx on public.${e.key} (workspace_id, created_at desc);`);
  for (const r of refs) out.push(`create index ${e.key}_${r.name}_idx on public.${e.key} (${r.name});`);
  if (e.dateField) out.push(`create index ${e.key}_${e.dateField}_idx on public.${e.key} (workspace_id, ${e.dateField});`);
  if (e.statusField) out.push(`create index ${e.key}_${e.statusField}_idx on public.${e.key} (workspace_id, ${e.statusField});`);

  // Proteção de autoria/workspace + updated_at
  out.push(
    `create trigger ${e.key}_protect before update on public.${e.key}\n  for each row execute function public.protect_ownership();`,
  );

  // Validação de referências no mesmo workspace
  if (refs.length) {
    const body = refs
      .map(
        (r) =>
          `  if tg_op = 'INSERT' or new.${r.name} is distinct from old.${r.name} then\n    perform public.assert_same_workspace('${r.reference}', new.${r.name}, new.workspace_id);\n  end if;`,
      )
      .join("\n");
    out.push(`create or replace function public.tg_${e.key}_refs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
${body}
  return new;
end;
$$;`);
    out.push(
      `create trigger ${e.key}_refs before insert or update on public.${e.key}\n  for each row execute function public.tg_${e.key}_refs();`,
    );
  }

  // Índice de busca + limpeza de relacionamentos
  const args = [e.titleField, e.subtitleField ?? "", ...e.searchFields].map((a) => lit(a)).join(", ");
  out.push(
    `create trigger ${e.key}_index after insert or update or delete on public.${e.key}\n  for each row execute function public.tg_index_entity(${args});`,
  );

  // RLS
  out.push(`alter table public.${e.key} enable row level security;`);
  out.push(
    `create policy ${e.key}_select on public.${e.key} for select to authenticated\n  using (public.is_workspace_member(workspace_id));`,
  );
  out.push(
    `create policy ${e.key}_insert on public.${e.key} for insert to authenticated\n  with check (public.can_write_workspace(workspace_id) and created_by = auth.uid());`,
  );
  out.push(
    `create policy ${e.key}_update on public.${e.key} for update to authenticated\n  using (public.can_edit_row(workspace_id, created_by))\n  with check (public.can_edit_row(workspace_id, created_by));`,
  );
  out.push(
    `create policy ${e.key}_delete on public.${e.key} for delete to authenticated\n  using (public.can_edit_row(workspace_id, created_by));`,
  );

  const fks = refs
    .map(
      (r) =>
        `alter table public.${e.key}\n  add constraint ${e.key}_${r.name}_fkey foreign key (${r.name}) references public.${r.reference} (id) on delete ${r.onDelete ?? "set null"};`,
    )
    .join("\n");

  return { create: out.join("\n\n"), fks };
}

const header = `-- =====================================================================
-- Migration 0002: tabelas de conteúdo
-- ARQUIVO GERADO por scripts/generate-entity-sql.ts a partir de
-- src/modules/entities/definitions.ts. Não edite manualmente.
-- =====================================================================
`;

const parts = ENTITIES.map(entitySql);
const sql = [
  header,
  ...parts.map((p) => p.create),
  "-- Chaves estrangeiras entre tabelas de conteúdo",
  ...parts.map((p) => p.fks).filter(Boolean),
  "",
].join("\n\n");

writeFileSync(out, sql);
console.log(`Gerado ${out} (${ENTITIES.length} tabelas)`);
