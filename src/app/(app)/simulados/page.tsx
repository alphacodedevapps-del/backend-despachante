import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime, formatNumber } from "@/lib/utils/format";
import { QuizBuilder } from "@/modules/studies/quiz-builder";
import { TrendLines, ChartTable } from "@/components/charts/charts";

export const metadata: Metadata = { title: "Simulados" };

export default async function QuizzesPage({ searchParams }: { searchParams: Promise<{ disciplina?: string; assunto?: string }> }) {
  const ctx = await requireSession();
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ data: subjects }, { data: topicsRaw, count }, { data: attempts }] = await Promise.all([
    supabase.from("subjects").select("id, name").eq("workspace_id", ctx.workspace.id).order("name"),
    supabase.from("questions").select("topic", { count: "exact" }).eq("workspace_id", ctx.workspace.id).not("topic", "is", null).limit(2000),
    supabase.from("quiz_attempts").select("id, quiz_id, finished_at, score_percent, objective_correct, objective_total, duration_seconds, quizzes(title)").eq("workspace_id", ctx.workspace.id).eq("created_by", ctx.user.id).order("finished_at", { ascending: false }).limit(30),
  ]);
  const { count: totalQuestions } = await supabase.from("questions").select("id", { count: "exact", head: true }).eq("workspace_id", ctx.workspace.id);
  const topics = Array.from(new Set(((topicsRaw ?? []) as { topic: string }[]).map((t) => t.topic))).sort();
  type A = { id: string; finished_at: string; score_percent: number | null; objective_correct: number; objective_total: number; duration_seconds: number | null; quizzes: { title: string } | { title: string }[] | null };
  const list = (attempts ?? []) as unknown as A[];
  const chart = list.slice().reverse().filter((a) => a.score_percent !== null).map((a) => ({ label: formatDateTime(a.finished_at).slice(0, 5), nota: Number(a.score_percent) }));
  void count;

  return (
    <div className="space-y-6">
      <PageHeader title="Simulados" description="Gere simulados a partir das suas questões, com filtros e cronômetro. A correção é feita no servidor e o histórico é registrado." icon="Timer" />
      <Card>
        <CardHeader><div><CardTitle>Novo simulado</CardTitle><CardDescription>{totalQuestions ?? 0} questão(ões) disponível(is) neste workspace.</CardDescription></div></CardHeader>
        <CardContent>
          <QuizBuilder subjects={(subjects ?? []) as { id: string; name: string }[]} topics={topics} defaults={{ subjectId: sp.disciplina, topic: sp.assunto }} total={totalQuestions ?? 0} />
        </CardContent>
      </Card>
      {chart.length >= 2 && (
        <Card>
          <CardHeader><CardTitle>Desempenho nos simulados</CardTitle></CardHeader>
          <CardContent><TrendLines data={chart} series={[{ key: "nota", label: "Aproveitamento (%)" }]} unit="%" yMax={100} /><ChartTable data={chart} series={[{ key: "nota", label: "Aproveitamento (%)" }]} xLabel="Data" /></CardContent>
        </Card>
      )}
      <Card>
        <CardHeader><CardTitle>Histórico</CardTitle></CardHeader>
        <CardContent>
          {list.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum simulado realizado ainda.</p>
          ) : (
            <ul className="divide-y divide-border">
              {list.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <Link href={`/simulados/resultado/${a.id}`} className="min-w-0 hover:text-primary">
                    <span className="block truncate font-medium">{(Array.isArray(a.quizzes) ? a.quizzes[0]?.title : a.quizzes?.title) ?? "Simulado"}</span>
                    <span className="text-xs text-muted-foreground">{formatDateTime(a.finished_at)}{a.duration_seconds ? ` · ${Math.round(a.duration_seconds / 60)} min` : ""}</span>
                  </Link>
                  <span className="shrink-0 tabular-nums">{a.score_percent === null ? "—" : `${formatNumber(Number(a.score_percent), 1)}%`} <span className="text-xs text-muted-foreground">({a.objective_correct}/{a.objective_total} obj.)</span></span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
