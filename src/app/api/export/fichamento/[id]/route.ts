import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/session";
import { generateAbntReference } from "@/lib/domain/abnt";
import { optionLabel, getEntity } from "@/modules/entities/definitions";

/** Exporta o artigo + fichamentos em Markdown. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Inválido." }, { status: 400 });
  const supabase = await createClient();
  const { data: a } = await supabase.from("articles").select("*").eq("id", id).maybeSingle();
  if (!a) return NextResponse.json({ error: "Artigo não encontrado." }, { status: 404 });
  const { data: notes } = await supabase.from("article_notes").select("title, note_type, page_reference, content, created_at").eq("article_id", id).order("created_at");
  const entity = getEntity("articles");
  const f = (n: string) => entity.fields.find((x) => x.name === n)!;
  const ref = generateAbntReference({ reference_type: "artigo", authors: a.authors, title: a.title, source: a.journal, volume: a.volume, issue: a.issue, pages: a.pages, year: a.year, doi: a.doi, url: a.url, access_date: a.read_date });
  const sec = (label: string, v: unknown) => (v ? `\n## ${label}\n\n${String(v)}\n` : "");
  const md = [
    `# Fichamento: ${a.title}`,
    "",
    `**Referência (ABNT, gerada dos metadados — revise):** ${ref.text}`,
    ref.missing.length ? `\n> Metadados ausentes: ${ref.missing.join(", ")}.` : "",
    "",
    `- Tipo de estudo: ${a.study_type ? optionLabel(f("study_type"), a.study_type) : "não informado"}`,
    `- Área: ${a.knowledge_area ?? "não informada"}`,
    `- Palavras-chave: ${(a.keywords ?? []).join(", ") || "—"}`,
    `- Status de leitura: ${optionLabel(f("reading_status"), a.reading_status)}${a.read_date ? ` (lido em ${String(a.read_date).split("-").reverse().join("/")})` : ""}`,
    sec("Objetivo", a.objective),
    sec("Metodologia", a.methodology),
    sec("Amostra", a.sample),
    sec("Resultados", a.results),
    sec("Conclusão", a.conclusion),
    sec("Limitações", a.limitations),
    sec("Análise crítica pessoal", a.critical_analysis),
    ...((notes ?? []) as { title: string; note_type: string; page_reference: string | null; content: string }[]).map((n) => `\n## ${n.title}${n.page_reference ? ` (p. ${n.page_reference})` : ""}\n\n${n.content}\n`),
    `\n---\nExportado da Central Acadêmica em ${new Date().toLocaleDateString("pt-BR")}.`,
  ].join("\n");
  const safe = String(a.title).normalize("NFD").replace(/[^\w]+/g, "-").slice(0, 60);
  return new NextResponse(md, { headers: { "Content-Type": "text/markdown; charset=utf-8", "Content-Disposition": `attachment; filename="fichamento-${safe}.md"`, "Cache-Control": "no-store" } });
}
