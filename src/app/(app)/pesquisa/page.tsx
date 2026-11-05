import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/shared/page-header";
import { StatTile, ListCard, ListRow } from "@/components/dashboard/widgets";
import { requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { toneFor } from "@/modules/entities/components/field-value";
import { ENTITY_MAP, optionLabel } from "@/modules/entities/definitions";
import { formatRelative } from "@/lib/utils/format";

export const metadata: Metadata = { title: "Central de pesquisa" };

export default async function ResearchHub() {
  const ctx = await requireSession();
  const ws = ctx.workspace.id;
  const supabase = await createClient();
  const cnt = (t: string, f?: string, v?: string) => {
    let q = supabase.from(t).select("id", { count: "exact", head: true }).eq("workspace_id", ws);
    if (f && v) q = q.eq(f, v);
    return q.then((r) => r.count ?? 0);
  };
  const [total, reading, read, review, notes, cols, refs, inReading, toReview, projects] = await Promise.all([
    cnt("articles"), cnt("articles", "reading_status", "em_leitura"), cnt("articles", "reading_status", "lido"), cnt("articles", "reading_status", "revisar"),
    cnt("article_notes"), cnt("article_collections"), cnt("citations"),
    supabase.from("articles").select("id, title, authors, updated_at").eq("workspace_id", ws).eq("reading_status", "em_leitura").order("updated_at", { ascending: false }).limit(6),
    supabase.from("articles").select("id, title, authors, updated_at").eq("workspace_id", ws).eq("reading_status", "revisar").order("updated_at", { ascending: false }).limit(6),
    supabase.from("projects").select("id, name, status, project_type").eq("workspace_id", ws).in("project_type", ["projeto_cientifico", "projeto_pesquisa", "revisao_integrativa", "revisao_sistematica", "artigo_original", "tcc"]).neq("status", "concluido").limit(6),
  ]);
  const statusField = ENTITY_MAP.projects.fields.find((f) => f.name === "status")!;
  return (
    <div className="space-y-6">
      <PageHeader title="Central de pesquisa" description="Artigos, fichamentos, coleções, referências e projetos científicos." icon="Microscope"
        actions={<><Link href="/artigos/novo" className={buttonVariants()}><Plus /> Novo artigo</Link><Link href="/projetos-pesquisa/novo" className={buttonVariants({ variant: "outline" })}><Plus /> Projeto de pesquisa</Link></>} />
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Artigos" value={total} icon="FileText" href="/artigos" hint={`${read} lidos · ${reading} em leitura · ${review} a revisar`} />
        <StatTile label="Fichamentos" value={notes} icon="ScrollText" href="/fichamentos" />
        <StatTile label="Coleções" value={cols} icon="Library" href="/colecoes" />
        <StatTile label="Referências" value={refs} icon="Quote" href="/referencias" />
      </section>
      <div className="grid gap-6 lg:grid-cols-3">
        <ListCard title="Em leitura" href="/artigos?reading_status=em_leitura" empty="Nenhum artigo em leitura.">
          {((inReading.data ?? []) as { id: string; title: string; authors: string | null; updated_at: string }[]).map((a) => <ListRow key={a.id} href={`/artigos/${a.id}`} title={a.title} meta={`${a.authors?.split(";")[0] ?? ""} · ${formatRelative(a.updated_at)}`} />)}
        </ListCard>
        <ListCard title="Para revisar" href="/artigos?reading_status=revisar" empty="Nada marcado para revisão.">
          {((toReview.data ?? []) as { id: string; title: string; authors: string | null; updated_at: string }[]).map((a) => <ListRow key={a.id} href={`/artigos/${a.id}`} title={a.title} meta={a.authors?.split(";")[0] ?? ""} />)}
        </ListCard>
        <ListCard title="Projetos científicos ativos" href="/projetos-pesquisa" empty="Nenhum projeto científico ativo.">
          {((projects.data ?? []) as { id: string; name: string; status: string }[]).map((p) => <ListRow key={p.id} href={`/projetos/${p.id}`} title={p.name} right={<Badge tone={toneFor(p.status)}>{optionLabel(statusField, p.status)}</Badge>} />)}
        </ListCard>
      </div>
      <p className="text-sm text-muted-foreground">Dica: pesquise artigos por título, autor, DOI ou palavra-chave em <Link href="/artigos" className="text-primary hover:underline">Artigos científicos</Link>.</p>
    </div>
  );
}
