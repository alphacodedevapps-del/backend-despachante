import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { QuizRunner, type RunnerQuestion } from "@/modules/studies/quiz-runner";

export const metadata: Metadata = { title: "Simulado" };

export default async function QuizRunPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const { data: quiz } = await supabase.from("quizzes").select("id, title, time_limit_minutes").eq("id", id).maybeSingle();
  if (!quiz) notFound();
  // O gabarito das objetivas NÃO é enviado ao navegador; a correção ocorre no servidor.
  const { data } = await supabase.from("quiz_questions").select("position, questions(id, statement, question_type, options, expected_answer)").eq("quiz_id", id).order("position");
  type R = { questions: RunnerQuestion | RunnerQuestion[] | null };
  const questions = ((data ?? []) as unknown as R[]).map((r) => (Array.isArray(r.questions) ? r.questions[0] : r.questions)).filter((q): q is RunnerQuestion => Boolean(q)).map((q) => ({ ...q, options: q.options ?? [], expected_answer: q.question_type === "discursiva" ? q.expected_answer : null }));
  return (
    <div>
      <PageHeader title={quiz.title as string} description={`${questions.length} questão(ões)${quiz.time_limit_minutes ? ` · ${quiz.time_limit_minutes} min` : ""}`} icon="Timer" breadcrumbs={[{ label: "Simulados", href: "/simulados" }, { label: "Em andamento" }]} />
      <QuizRunner quizId={id} questions={questions} timeLimitMinutes={(quiz.time_limit_minutes as number | null) ?? null} />
    </div>
  );
}
