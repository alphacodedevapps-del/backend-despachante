import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/shared/page-header";
import { requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { BODY_REGIONS } from "@/modules/entities/definitions";
import { cn } from "@/lib/utils/cn";

export const metadata: Metadata = { title: "Conhecimento por região anatômica" };

const REGIONS = BODY_REGIONS.slice(0, 9);
const SOURCES = [
  { table: "pathologies", slug: "patologias", label: "Patologias", title: "name" },
  { table: "clinical_tests", slug: "testes", label: "Testes especiais", title: "name" },
  { table: "exercises", slug: "exercicios", label: "Exercícios", title: "name" },
  { table: "anatomical_structures", slug: "atlas", label: "Estruturas anatômicas", title: "name" },
  { table: "league_activities", slug: "liga-atividades", label: "Projetos e atividades da liga", title: "title" },
] as const;

export default async function RegionsPage({ searchParams }: { searchParams: Promise<{ regiao?: string; foco?: string }> }) {
  const ctx = await requireSession();
  const sp = await searchParams;
  const region = REGIONS.find((r) => r.value === sp.regiao)?.value ?? null;
  const foco = sp.foco === "traumatologia" || sp.foco === "ortopedia" ? sp.foco : null;
  const supabase = await createClient();

  const counts = await Promise.all(
    REGIONS.map(async (r) => {
      const res = await Promise.all(SOURCES.map((s) => supabase.from(s.table).select("id", { count: "exact", head: true }).eq("workspace_id", ctx.workspace.id).eq("body_region", r.value)));
      return res.reduce((sum, x) => sum + (x.count ?? 0), 0);
    }),
  );

  const groups = region
    ? await Promise.all(
        SOURCES.map(async (s) => {
          let q = supabase.from(s.table).select(`id, ${s.title}`).eq("workspace_id", ctx.workspace.id).eq("body_region", region).order(s.title).limit(100);
          if (foco && s.table === "pathologies") q = q.contains("tags", [foco]);
          const { data } = await q;
          return { ...s, rows: (data ?? []) as unknown as Record<string, string>[] };
        }),
      )
    : [];

  const title = foco === "traumatologia" ? "Traumatologia" : foco === "ortopedia" ? "Ortopedia" : "Traumatologia e Ortopedia";
  const qs = (r: string | null) => `/liga/regioes?${new URLSearchParams({ ...(r ? { regiao: r } : {}), ...(foco ? { foco } : {}) }).toString()}`;

  return (
    <div className="space-y-6">
      <PageHeader title={`${title} — conhecimento por região`} description="Patologias, testes, exercícios, estruturas e atividades organizados por região anatômica." icon="Bone" breadcrumbs={[{ label: "Liga acadêmica", href: "/liga/regioes" }, { label: title }]} />
      {foco && <Alert tone="info">Patologias filtradas pela tag “{foco}”. Adicione essa tag às patologias para incluí-las neste foco.</Alert>}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-9">
        {REGIONS.map((r, i) => (
          <Link key={r.value} href={qs(r.value)} className={cn("rounded-lg border border-border bg-surface p-3 text-center text-sm hover:border-primary/40", region === r.value && "border-primary bg-primary-soft text-primary")}>
            <span className="block font-medium">{r.label}</span>
            <span className="text-xs text-muted-foreground tabular-nums">{counts[i]} itens</span>
          </Link>
        ))}
      </div>
      {!region && <p className="text-sm text-muted-foreground">Selecione uma região para ver os conteúdos relacionados.</p>}
      {region && (
        <div className="grid gap-4 md:grid-cols-2">
          {groups.map((g) => (
            <Card key={g.table}>
              <CardHeader><CardTitle>{g.label} ({g.rows.length})</CardTitle><Link href={`/${g.slug}/novo?body_region=${region}`} className="text-xs text-primary hover:underline">Adicionar</Link></CardHeader>
              <CardContent>
                {g.rows.length === 0 ? <p className="text-sm text-muted-foreground">Nada cadastrado para esta região.</p> : (
                  <ul className="divide-y divide-border">{g.rows.map((r) => <li key={r.id} className="py-1.5 text-sm"><Link href={`/${g.slug}/${r.id}`} className="hover:text-primary">{r[g.title]}</Link></li>)}</ul>
                )}
              </CardContent>
            </Card>
          ))}
          <Card>
            <CardHeader><CardTitle>Artigos e materiais</CardTitle></CardHeader>
            <CardContent className="text-sm text-muted-foreground">Relacione artigos e arquivos às patologias, testes e exercícios desta região usando “Conteúdos relacionados” em cada registro, ou <Link href={`/busca?q=${encodeURIComponent(REGIONS.find((r) => r.value === region)!.label)}`} className="text-primary hover:underline">pesquise “{REGIONS.find((r) => r.value === region)!.label}”</Link>.</CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
