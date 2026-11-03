import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, XCircle, MinusCircle } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime, formatNumber } from "@/lib/utils/format";
import type { GradedAnswer } from "@/lib/domain/quiz";
import { cn } from "@/lib/utils/cn";

export const metadata: Metadata = { title: "Resultado do simulado" };

export default async function ResultPage({ params }: { params: Promise<{ attemptId: string }> }) {
  await requireSession();
  const { attemptId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(attemptId)) notFound();
  const supabase = await createClient();
  const { data: attempt } = await supabase.from("quiz_attempts").select("*, quizzes(title)").eq("id", attemptId).maybeSingle();
  if (!attempt) notFound();
  const answers = (attempt.answers ?? []) as GradedAnswer[];
  const { data: qs } = await supabase.from("questions").select("id, statement, question_type, options, correct_option, expected_answer, explanation").in("id", answers.map((a) => a.question_id));
  type Q = { id: string; statement: string; question_type: string; options: string[]; correct_option: number | null; expected_answer: string | null; explanation: string | null };
  const byId = new Map(((qs ?? []) as Q[]).map((q) => [q.id, q]));
  const quizTitle = (Array.isArray(attempt.quizzes) ? attempt.quizzes[0]?.title : attempt.quizzes?.title) ?? "Simulado";

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader title={`Resultado: ${quizTitle}`} description={`Concluído em ${formatDateTime(attempt.finished_at as string)}`} icon="Timer" breadcrumbs={[{ label: "Simulados", href: "/simulados" }, { label: "Resultado" }]} actions={<Link href="/simulados" className={buttonVariants()}>Novo simulado</Link>} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardContent className="pt-5"><p className="text-xs text-muted-foreground">Aproveitamento</p><p className="text-3xl font-semibold tabular-nums">{attempt.score_percent === null ? "—" : `${formatNumber(Number(attempt.score_percent), 1)}%`}</p></CardContent></Card>
        <Card><CardContent className="pt-5"><p className="text-xs text-muted-foreground">Objetivas corretas</p><p className="text-3xl font-semibold tabular-nums">{attempt.objective_correct}/{attempt.objective_total}</p></CardContent></Card>
        <Card><CardContent className="pt-5"><p className="text-xs text-muted-foreground">Duração</p><p className="text-3xl font-semibold tabular-nums">{attempt.duration_seconds ? `${Math.floor(attempt.duration_seconds / 60)}m ${attempt.duration_seconds % 60}s` : "—"}</p></CardContent></Card>
      </div>
      <h2 className="text-sm font-semibold">Correção</h2>
      {answers.map((a, i) => {
        const q = byId.get(a.question_id);
        if (!q) return <Card key={a.question_id}><CardContent className="pt-5 text-sm text-muted-foreground">Questão {i + 1} foi excluída do banco.</CardContent></Card>;
        const Icon = a.correct === true ? CheckCircle2 : a.correct === false ? XCircle : MinusCircle;
        return (
          <Card key={a.question_id}>
            <CardContent className="space-y-3 pt-5 text-sm">
              <p className="flex gap-2 font-medium"><Icon className={cn("mt-0.5 size-4 shrink-0", a.correct === true ? "text-success" : a.correct === false ? "text-danger" : "text-muted-foreground")} aria-label={a.correct === true ? "Correta" : a.correct === false ? "Incorreta" : "Sem avaliação"} /> <span className="whitespace-pre-wrap">{i + 1}. {q.statement}</span></p>
              {q.question_type === "objetiva" ? (
                <ol className="space-y-1">
                  {(q.options ?? []).map((o, k) => (
                    <li key={k} className={cn("rounded px-2 py-1", k === q.correct_option && "bg-success-soft", k === a.selected_option && k !== q.correct_option && "bg-danger-soft")}>
                      <strong>{String.fromCharCode(65 + k)})</strong> {o} {k === q.correct_option && <span className="text-xs text-success">(correta)</span>} {k === a.selected_option && <span className="text-xs text-muted-foreground">(sua resposta)</span>}
                    </li>
                  ))}
                </ol>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded bg-surface-muted p-2"><p className="text-xs text-muted-foreground">Sua resposta</p><p className="whitespace-pre-wrap">{a.text_answer || "—"}</p></div>
                  <div className="rounded bg-surface-muted p-2"><p className="text-xs text-muted-foreground">Resposta esperada</p><p className="whitespace-pre-wrap">{q.expected_answer || "—"}</p></div>
                </div>
              )}
              {q.explanation && <p className="rounded border-l-2 border-primary bg-primary-soft/40 p-2 text-muted-foreground"><strong className="text-foreground">Comentário:</strong> {q.explanation}</p>}
              <Link href={`/questoes/${q.id}`} className="text-xs text-primary hover:underline">Abrir questão</Link>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
