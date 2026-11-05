import type * as React from "react";
import Link from "next/link";
import { CalendarClock, Layers, Timer } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { createClient } from "@/lib/supabase/server";
import { publicAiStatus } from "@/lib/ai/config";
import type { SessionContext } from "@/lib/session";
import { formatDateTime, formatNumber } from "@/lib/utils/format";
import { generateAbntReference } from "@/lib/domain/abnt";
import { ProjectStages, type Stage } from "@/modules/projects/stages";
import { AbntReferenceCard, CollectionsPicker } from "@/modules/research/article-tools";
import { AiStudyTools } from "@/modules/studies/ai-study-tools";
import type { Row } from "./queries";

export interface ExtensionProps {
  row: Row;
  ctx: SessionContext;
  editable: boolean;
}

type Extension = (props: ExtensionProps) => React.ReactNode | Promise<React.ReactNode>;

const str = (v: unknown) => (typeof v === "string" ? v : v === null || v === undefined ? null : String(v));

async function ArticleExtension({ row, editable }: ExtensionProps) {
  const supabase = await createClient();
  const [{ data: collections }, { data: items }, { data: citation }] = await Promise.all([
    supabase.from("article_collections").select("id, name").eq("workspace_id", row.workspace_id).order("name"),
    supabase.from("article_collection_items").select("collection_id").eq("article_id", row.id),
    supabase.from("citations").select("id").eq("article_id", row.id).limit(1).maybeSingle(),
  ]);
  const ai = publicAiStatus();
  const input = {
    reference_type: "artigo",
    authors: str(row.authors),
    title: str(row.title),
    source: str(row.journal),
    volume: str(row.volume),
    issue: str(row.issue),
    pages: str(row.pages),
    year: str(row.year),
    doi: str(row.doi),
    url: str(row.url),
    access_date: str(row.read_date) ?? str(row.created_at)?.slice(0, 10) ?? null,
  };
  return (
    <>
      <AbntReferenceCard input={input} articleId={row.id} existingCitationId={(citation?.id as string | undefined) ?? null} editable={editable} />
      <CollectionsPicker articleId={row.id} collections={(collections ?? []) as { id: string; name: string }[]} memberIds={((items ?? []) as { collection_id: string }[]).map((i) => i.collection_id)} editable={editable} />
      <AiStudyTools type="articles" id={row.id} kinds={["fichamento", "resumo", "flashcards", "questoes"]} aiConfigured={ai.chatConfigured} articleId={row.id} defaultTopic={str(row.title)} editable={editable} />
    </>
  );
}

async function CollectionExtension({ row }: ExtensionProps) {
  const supabase = await createClient();
  const { data } = await supabase.from("article_collection_items").select("article_id, articles(id, title, year, reading_status)").eq("collection_id", row.id);
  type It = { article_id: string; articles: { id: string; title: string; year: number | null } | { id: string; title: string; year: number | null }[] | null };
  const articles = ((data ?? []) as It[]).map((i) => (Array.isArray(i.articles) ? i.articles[0] : i.articles)).filter(Boolean) as { id: string; title: string; year: number | null }[];
  return (
    <Card>
      <CardHeader><CardTitle>Artigos da coleção ({articles.length})</CardTitle></CardHeader>
      <CardContent>
        {articles.length === 0 ? (
          <p className="text-sm text-muted-foreground">Adicione artigos a esta coleção pela página de cada artigo.</p>
        ) : (
          <ul className="divide-y divide-border">
            {articles.map((a) => (
              <li key={a.id} className="flex justify-between gap-2 py-2 text-sm">
                <Link href={`/artigos/${a.id}`} className="hover:text-primary">{a.title}</Link>
                <span className="text-muted-foreground">{a.year ?? ""}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

async function ProjectExtension({ row, editable }: ExtensionProps) {
  const supabase = await createClient();
  const { data } = await supabase.from("project_stages").select("id, title, is_done, position, due_date").eq("project_id", row.id).order("position").order("created_at");
  return <ProjectStages projectId={row.id} stages={(data ?? []) as Stage[]} editable={editable} />;
}

function studyTools(type: string, kinds: ("flashcards" | "questoes" | "resumo" | "roteiro")[], subjectField?: string) {
  const Ext = function StudyExt({ row, editable }: ExtensionProps) {
    const ai = publicAiStatus();
    const e = { subjects: "name", study_notes: "title", pathologies: "name", clinical_tests: "name", exercises: "name", anatomical_structures: "name", protocols: "name", clinical_cases: "case_code" } as Record<string, string>;
    return (
      <AiStudyTools
        type={type}
        id={row.id}
        kinds={kinds}
        aiConfigured={ai.chatConfigured}
        subjectId={subjectField ? str(row[subjectField]) : type === "subjects" ? row.id : null}
        defaultTopic={str(row[e[type] ?? "title"]) ?? str(row.topic)}
        editable={editable}
      />
    );
  };
  return Ext;
}

const SubjectTools = studyTools("subjects", ["flashcards", "questoes", "roteiro"]);

async function SubjectExtension(props: ExtensionProps) {
  const { row } = props;
  const supabase = await createClient();
  const [notes, assessments, cards, docs] = await Promise.all([
    supabase.from("study_notes").select("study_status").eq("subject_id", row.id),
    supabase.from("assessments").select("score, max_score, weight, status").eq("subject_id", row.id),
    supabase.from("flashcards").select("id", { count: "exact", head: true }).eq("subject_id", row.id),
    supabase.from("documents").select("id", { count: "exact", head: true }).eq("subject_id", row.id).eq("upload_status", "enviado"),
  ]);
  const n = (notes.data ?? []) as { study_status: string }[];
  const studied = n.filter((x) => x.study_status === "estudado").length;
  const pending = n.filter((x) => x.study_status !== "estudado").length;
  const graded = ((assessments.data ?? []) as { score: number | null; max_score: number | null; weight: number | null }[]).filter((a) => a.score !== null && a.max_score);
  const avg = graded.length ? graded.reduce((s, a) => s + ((a.score as number) / (a.max_score as number)) * 10 * (a.weight || 1), 0) / graded.reduce((s, a) => s + (a.weight || 1), 0) : null;
  const progress = Number(row.learning_progress ?? 0);
  return (
    <>
      <Card>
        <CardHeader><CardTitle>Progresso de aprendizagem</CardTitle><span className="text-sm font-semibold text-primary tabular-nums">{progress}%</span></CardHeader>
        <CardContent className="space-y-4">
          <Progress value={progress} label="Progresso da disciplina" />
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div><dt className="text-xs text-muted-foreground">Conteúdos estudados</dt><dd className="text-lg font-semibold tabular-nums">{studied}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Conteúdos pendentes</dt><dd className="text-lg font-semibold tabular-nums">{pending}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Média (0–10)</dt><dd className="text-lg font-semibold tabular-nums">{avg === null ? "—" : formatNumber(avg, 1)}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Flashcards · materiais</dt><dd className="text-lg font-semibold tabular-nums">{cards.count ?? 0} · {docs.count ?? 0}</dd></div>
          </dl>
          <div className="flex flex-wrap gap-2">
            <Link href={`/biblioteca?disciplina=${row.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>Materiais na biblioteca</Link>
            <Link href={`/simulados?disciplina=${row.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}><Timer /> Testar meus conhecimentos</Link>
          </div>
        </CardContent>
      </Card>
      <SubjectTools {...props} />
    </>
  );
}

async function FlashcardExtension({ row }: ExtensionProps) {
  const supabase = await createClient();
  const { data } = await supabase.from("flashcard_reviews").select("rating, reviewed_at").eq("flashcard_id", row.id).order("reviewed_at", { ascending: false }).limit(10);
  return (
    <Card>
      <CardHeader>
        <div><CardTitle>Revisão espaçada</CardTitle><CardDescription>Próxima revisão: {formatDateTime(String(row.next_review_at))}</CardDescription></div>
        <Link href="/revisao-flashcards" className={buttonVariants({ size: "sm" })}><Layers /> Revisar agora</Link>
      </CardHeader>
      <CardContent className="text-sm">
        <p>Acertos: <strong>{String(row.correct_count)}</strong> · Erros: <strong>{String(row.wrong_count)}</strong> · Intervalo: {String(row.interval_days)} dia(s) · Facilidade: {String(row.ease_factor)}</p>
        {(data ?? []).length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-1 text-xs text-muted-foreground">
            {((data ?? []) as { rating: string; reviewed_at: string }[]).map((r, i) => (
              <li key={i} className="rounded bg-surface-muted px-2 py-0.5">{r.rating} · {formatDateTime(r.reviewed_at)}</li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function QuestionExtension({ row }: ExtensionProps) {
  const opts = (row.options as string[]) ?? [];
  const correct = row.correct_option as number | null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Pré-visualização</CardTitle>
        <Link href={`/simulados?${row.subject_id ? `disciplina=${row.subject_id}&` : ""}${row.topic ? `assunto=${encodeURIComponent(String(row.topic))}` : ""}`} className={buttonVariants({ size: "sm", variant: "outline" })}><Timer /> Testar meus conhecimentos</Link>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <p className="whitespace-pre-wrap">{String(row.statement)}</p>
        {opts.length > 0 && (
          <ol className="list-[upper-alpha] space-y-1 pl-5">
            {opts.map((o, i) => <li key={i} className={i === correct ? "font-medium text-success" : ""}>{o}</li>)}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

async function InternshipExtension({ row }: ExtensionProps) {
  const supabase = await createClient();
  const { data } = await supabase.from("internship_logs").select("hours").eq("internship_id", row.id);
  const done = ((data ?? []) as { hours: number }[]).reduce((s, l) => s + Number(l.hours || 0), 0);
  const planned = Number(row.planned_hours ?? 0);
  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><CalendarClock className="size-4 text-primary" /> Horas do estágio</CardTitle><span className="text-sm tabular-nums">{formatNumber(done, 1)} / {planned ? formatNumber(planned, 1) : "—"} h</span></CardHeader>
      <CardContent><Progress value={planned ? (done / planned) * 100 : 0} label="Horas cumpridas" /><p className="mt-2 text-xs text-muted-foreground">Horas cumpridas = soma dos registros de estágio.</p></CardContent>
    </Card>
  );
}

function CitationExtension({ row }: ExtensionProps) {
  const ref = generateAbntReference(row as never);
  return (
    <Card>
      <CardHeader><div><CardTitle>Pré-visualização ABNT (a partir dos metadados)</CardTitle><CardDescription>{row.formatted_reference ? "O texto salvo em “Referência formatada” prevalece; revise se houver diferenças." : "Use “Gerar ABNT” no formulário para salvar o texto."}</CardDescription></div></CardHeader>
      <CardContent><p className="text-sm leading-relaxed">{ref.segments.map((s, i) => (s.bold ? <strong key={i}>{s.text}</strong> : <span key={i}>{s.text}</span>))}</p>
        {ref.missing.length > 0 && <p className="mt-2 text-xs text-warning">Ausentes: {ref.missing.join(", ")}.</p>}
      </CardContent>
    </Card>
  );
}

export const DETAIL_EXTENSIONS: Record<string, Extension> = {
  articles: ArticleExtension,
  article_collections: CollectionExtension,
  projects: ProjectExtension,
  subjects: SubjectExtension,
  study_notes: studyTools("study_notes", ["flashcards", "questoes", "resumo", "roteiro"], "subject_id"),
  pathologies: studyTools("pathologies", ["flashcards", "questoes", "resumo"]),
  clinical_tests: studyTools("clinical_tests", ["flashcards", "questoes"]),
  anatomical_structures: studyTools("anatomical_structures", ["flashcards", "questoes"]),
  flashcards: FlashcardExtension,
  questions: QuestionExtension,
  internships: InternshipExtension,
  citations: CitationExtension,
};
