import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/input";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Icon } from "@/components/shared/icon";
import { requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { entityHref, entityTypeIcon, entityTypeLabel, SEARCHABLE_TYPES } from "@/modules/entities/links";

export const metadata: Metadata = { title: "Busca" };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string; tipo?: string; todos?: string }> }) {
  const ctx = await requireSession();
  const sp = await searchParams;
  const q = (sp.q ?? "").slice(0, 200);
  const type = SEARCHABLE_TYPES.some((t) => t.type === sp.tipo) ? sp.tipo! : null;
  const supabase = await createClient();
  const { data } = q.trim().length >= 2 ? await supabase.rpc("global_search", { p_query: q, p_workspace_id: sp.todos === "1" ? null : ctx.workspace.id, p_types: type ? [type] : null, p_limit: 120 }) : { data: [] };
  const hits = (data ?? []) as { entity_type: string; entity_id: string; workspace_id: string; title: string; subtitle: string | null; snippet: string | null }[];
  const groups = new Map<string, typeof hits>();
  for (const h of hits) groups.set(h.entity_type, [...(groups.get(h.entity_type) ?? []), h]);
  const wsName = new Map(ctx.workspaces.map((w) => [w.id, w.name]));

  return (
    <div className="space-y-4">
      <PageHeader title="Busca global" description="Disciplinas, artigos, patologias, exercícios, testes, anotações, projetos, casos, documentos, eventos e tarefas." icon="Search" />
      <form className="flex flex-col gap-2 sm:flex-row" action="/busca">
        <div className="relative flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input name="q" defaultValue={q} autoFocus placeholder="O que você procura?" className="h-10 w-full rounded-md border border-input bg-surface pl-9 pr-3 text-sm" aria-label="Termo de busca" /></div>
        <NativeSelect name="tipo" defaultValue={type ?? ""} className="h-10 sm:w-56" aria-label="Categoria"><option value="">Todas as categorias</option>{SEARCHABLE_TYPES.map((t) => <option key={t.type} value={t.type}>{t.label}</option>)}</NativeSelect>
        <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" name="todos" value="1" defaultChecked={sp.todos === "1"} className="accent-[var(--primary)]" /> Todos os workspaces</label>
        <button className={buttonVariants({ size: "lg" })}>Buscar</button>
      </form>
      {q.trim().length >= 2 && hits.length === 0 && <EmptyState icon="Search" title={`Nenhum resultado para “${q}”`} />}
      {Array.from(groups.entries()).map(([t, list]) => (
        <section key={t}>
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Icon name={entityTypeIcon(t)} className="size-4 text-muted-foreground" /> {entityTypeLabel(t)} ({list.length})</h2>
          <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
            {list.map((h) => (
              <li key={h.entity_id} className="p-3">
                <Link href={entityHref(h.entity_type, h.entity_id)} className="text-sm font-medium hover:text-primary">{h.title}</Link>
                <p className="line-clamp-2 text-xs text-muted-foreground">{[h.subtitle, sp.todos === "1" ? wsName.get(h.workspace_id) : null].filter(Boolean).join(" · ")}{h.snippet ? ` — ${h.snippet}` : ""}</p>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
