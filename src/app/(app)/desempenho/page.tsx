import type { Metadata } from "next";
import { format, startOfMonth, subMonths, startOfWeek, subWeeks, addDays } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { PageHeader } from "@/components/shared/page-header";
import { StatTile } from "@/components/dashboard/widgets";
import { Bars, ChartTable, TrendLines } from "@/components/charts/charts";
import { requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { formatNumber } from "@/lib/utils/format";

export const metadata: Metadata = { title: "Desempenho acadêmico" };

export default async function PerformancePage() {
  const ctx = await requireSession();
  const ws = ctx.workspace.id;
  const supabase = await createClient();
  const c = (table: string, f?: (q: ReturnType<typeof b>) => ReturnType<typeof b>) => (f ? f(b(table)) : b(table)).then((r) => r.count ?? 0);
  function b(table: string) {
    return supabase.from(table).select("id", { count: "exact", head: true }).eq("workspace_id", ws);
  }
  const since = subMonths(startOfMonth(new Date()), 5);
  const [subjectsDone, notesStudied, articlesRead, reviews, testsLearned, pathStudied, exercises, projectsDone, hoursRes, attempts, reviewRows, notesRows, articlesRows, subjectsRows, goals, semesters] = await Promise.all([
    c("subjects", (q) => q.eq("study_status", "estudado")),
    c("study_notes", (q) => q.eq("study_status", "estudado")),
    c("articles", (q) => q.eq("reading_status", "lido")),
    c("flashcard_reviews"),
    c("clinical_tests", (q) => q.in("mastery_level", ["intermediario", "avancado"])),
    c("pathologies", (q) => q.eq("study_status", "estudado")),
    c("exercises"),
    c("projects", (q) => q.eq("status", "concluido")),
    supabase.from("complementary_activities").select("hours").eq("workspace_id", ws).neq("status", "rejeitada").limit(5000),
    supabase.from("quiz_attempts").select("finished_at, score_percent, objective_total, discursive_total").eq("workspace_id", ws).eq("created_by", ctx.user.id).gte("finished_at", since.toISOString()).order("finished_at").limit(2000),
    supabase.from("flashcard_reviews").select("reviewed_at, was_correct").eq("workspace_id", ws).gte("reviewed_at", since.toISOString()).limit(20000),
    supabase.from("study_notes").select("created_at").eq("workspace_id", ws).gte("created_at", since.toISOString()).limit(10000),
    supabase.from("articles").select("read_date").eq("workspace_id", ws).eq("reading_status", "lido").gte("read_date", format(since, "yyyy-MM-dd")).limit(10000),
    supabase.from("subjects").select("name, final_grade, learning_progress, semester_id").eq("workspace_id", ws).limit(500),
    supabase.from("study_goals").select("title, progress").eq("workspace_id", ws).eq("status", "ativa").limit(20),
    supabase.from("semesters").select("id, name, start_date").eq("workspace_id", ws).order("start_date").limit(30),
  ]);
  const hours = ((hoursRes.data ?? []) as { hours: number }[]).reduce((s, r) => s + Number(r.hours), 0);
  const att = (attempts.data ?? []) as { finished_at: string; score_percent: number | null; objective_total: number; discursive_total: number }[];
  const questionsAnswered = att.reduce((s, a) => s + a.objective_total + a.discursive_total, 0);
  const scored = att.filter((a) => a.score_percent !== null);
  const avgScore = scored.length ? scored.reduce((s, a) => s + Number(a.score_percent), 0) / scored.length : null;

  // Semanal (12 semanas)
  const weeks = Array.from({ length: 12 }, (_, i) => {
    const s = startOfWeek(subWeeks(new Date(), 11 - i), { weekStartsOn: 1 });
    return { s, e: addDays(s, 7), label: format(s, "dd/MM"), revisoes: 0, anotacoes: 0, artigos: 0 };
  });
  const months = Array.from({ length: 6 }, (_, i) => {
    const s = subMonths(startOfMonth(new Date()), 5 - i);
    return { s, e: subMonths(s, -1), label: format(s, "MM/yyyy"), revisoes: 0, anotacoes: 0, artigos: 0, acerto: null as number | null, _ok: 0, _n: 0 };
  });
  const put = <T extends { s: Date; e: Date }>(arr: T[], iso: string, fn: (b: T) => void) => {
    const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
    const x = arr.find((w) => d >= w.s && d < w.e);
    if (x) fn(x);
  };
  for (const r of (reviewRows.data ?? []) as { reviewed_at: string; was_correct: boolean }[]) {
    put(weeks, r.reviewed_at, (x) => x.revisoes++);
    put(months, r.reviewed_at, (x) => { x.revisoes++; x._n++; if (r.was_correct) x._ok++; });
  }
  for (const r of (notesRows.data ?? []) as { created_at: string }[]) { put(weeks, r.created_at, (x) => x.anotacoes++); put(months, r.created_at, (x) => x.anotacoes++); }
  for (const r of (articlesRows.data ?? []) as { read_date: string }[]) { put(weeks, r.read_date, (x) => x.artigos++); put(months, r.read_date, (x) => x.artigos++); }
  for (const m of months) m.acerto = m._n ? Math.round((m._ok / m._n) * 100) : null;

  const subj = (subjectsRows.data ?? []) as { name: string; final_grade: number | null; learning_progress: number | null; semester_id: string | null }[];
  const sems = (semesters.data ?? []) as { id: string; name: string }[];
  const semesterData = sems.map((s) => {
    const list = subj.filter((x) => x.semester_id === s.id && x.final_grade !== null);
    return { label: s.name, media: list.length ? Math.round((list.reduce((a, x) => a + Number(x.final_grade), 0) / list.length) * 10) / 10 : null };
  }).filter((s) => s.media !== null);
  const progressData = subj.filter((s) => (s.learning_progress ?? 0) > 0).slice(0, 12).map((s) => ({ label: s.name.slice(0, 22), progresso: s.learning_progress ?? 0 }));
  const scoreData = scored.map((a) => ({ label: format(new Date(a.finished_at), "dd/MM"), nota: Number(a.score_percent) }));
  const W = [{ key: "revisoes", label: "Revisões" }, { key: "anotacoes", label: "Anotações" }, { key: "artigos", label: "Artigos lidos" }];

  return (
    <div className="space-y-6">
      <PageHeader title="Desempenho acadêmico" description="Indicadores calculados a partir dos seus registros reais neste workspace." icon="ChartLine" />
      <Alert tone="info">Atividades registradas indicam estudo e organização — não constituem comprovação automática de competência clínica.</Alert>
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <StatTile label="Disciplinas concluídas" value={subjectsDone} icon="BookOpen" href="/disciplinas?study_status=estudado" />
        <StatTile label="Conteúdos estudados" value={notesStudied} icon="NotebookPen" href="/caderno?study_status=estudado" />
        <StatTile label="Artigos lidos" value={articlesRead} icon="FileText" href="/artigos?reading_status=lido" />
        <StatTile label="Revisões realizadas" value={reviews} icon="Layers" href="/flashcards" />
        <StatTile label="Questões respondidas" value={questionsAnswered} icon="CircleHelp" href="/simulados" hint="últimos 6 meses" />
        <StatTile label="Média em simulados" value={avgScore === null ? "—" : `${formatNumber(avgScore, 1)}%`} icon="Timer" href="/simulados" />
        <StatTile label="Patologias estudadas" value={pathStudied} icon="Activity" href="/patologias?study_status=estudado" />
        <StatTile label="Testes aprendidos" value={testsLearned} icon="Stethoscope" href="/testes" hint="domínio intermediário+" />
        <StatTile label="Exercícios cadastrados" value={exercises} icon="Dumbbell" href="/exercicios" />
        <StatTile label="Projetos concluídos" value={projectsDone} icon="KanbanSquare" href="/projetos?status=concluido" />
        <StatTile label="Horas complementares" value={formatNumber(hours, 1)} icon="Clock" href="/horas-complementares" />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><div><CardTitle>Evolução semanal</CardTitle><CardDescription>Últimas 12 semanas</CardDescription></div></CardHeader>
          <CardContent><TrendLines data={weeks.map(({ label, revisoes, anotacoes, artigos }) => ({ label, revisoes, anotacoes, artigos }))} series={W} /><ChartTable data={weeks.map(({ label, revisoes, anotacoes, artigos }) => ({ label, revisoes, anotacoes, artigos }))} series={W} xLabel="Semana" /></CardContent>
        </Card>
        <Card>
          <CardHeader><div><CardTitle>Evolução mensal</CardTitle><CardDescription>Últimos 6 meses</CardDescription></div></CardHeader>
          <CardContent><Bars data={months.map(({ label, revisoes, anotacoes, artigos }) => ({ label, revisoes, anotacoes, artigos }))} series={W} /><ChartTable data={months.map(({ label, revisoes, anotacoes, artigos, acerto }) => ({ label, revisoes, anotacoes, artigos, acerto }))} series={[...W, { key: "acerto", label: "Acerto em flashcards (%)" }]} xLabel="Mês" /></CardContent>
        </Card>
        <Card>
          <CardHeader><div><CardTitle>Desempenho em simulados</CardTitle><CardDescription>Aproveitamento por tentativa</CardDescription></div></CardHeader>
          <CardContent>{scoreData.length ? <><TrendLines data={scoreData} series={[{ key: "nota", label: "Aproveitamento (%)" }]} unit="%" yMax={100} /><ChartTable data={scoreData} series={[{ key: "nota", label: "Aproveitamento (%)" }]} xLabel="Data" /></> : <p className="text-sm text-muted-foreground">Nenhum simulado nos últimos 6 meses.</p>}</CardContent>
        </Card>
        <Card>
          <CardHeader><div><CardTitle>Evolução semestral</CardTitle><CardDescription>Média das notas finais por semestre</CardDescription></div></CardHeader>
          <CardContent>{semesterData.length ? <><Bars data={semesterData} series={[{ key: "media", label: "Média final" }]} /><ChartTable data={semesterData} series={[{ key: "media", label: "Média final" }]} xLabel="Semestre" /></> : <p className="text-sm text-muted-foreground">Cadastre semestres e notas finais nas disciplinas para ver a evolução.</p>}</CardContent>
        </Card>
        <Card>
          <CardHeader><div><CardTitle>Progresso por disciplina</CardTitle></div></CardHeader>
          <CardContent>{progressData.length ? <Bars data={progressData} series={[{ key: "progresso", label: "Progresso (%)" }]} layout="vertical" unit="%" height={Math.max(160, progressData.length * 30)} /> : <p className="text-sm text-muted-foreground">Sem progresso registrado nas disciplinas.</p>}</CardContent>
        </Card>
        <Card>
          <CardHeader><div><CardTitle>Progresso das metas</CardTitle></div></CardHeader>
          <CardContent className="space-y-3">
            {((goals.data ?? []) as { title: string; progress: number }[]).length === 0 && <p className="text-sm text-muted-foreground">Nenhuma meta ativa.</p>}
            {((goals.data ?? []) as { title: string; progress: number }[]).map((g) => (
              <div key={g.title}><div className="mb-1 flex justify-between text-sm"><span>{g.title}</span><span className="tabular-nums text-muted-foreground">{g.progress}%</span></div><Progress value={g.progress} label={g.title} /></div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
