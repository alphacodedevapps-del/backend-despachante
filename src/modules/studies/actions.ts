"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/session";
import { canWrite } from "@/lib/permissions";
import { fail, friendlyDbError, type ActionResult } from "@/lib/errors";
import { resolveSrsSettings, reviewCard, type Rating } from "@/lib/domain/srs";
import { gradeQuiz, shuffle, type QuizQuestion } from "@/lib/domain/quiz";

const UUID = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

export async function reviewFlashcardAction(cardId: string, rating: Rating): Promise<ActionResult<{ next_review_at: string; interval_days: number }>> {
  if (!UUID.safeParse(cardId).success || !["errei", "dificil", "bom", "facil"].includes(rating)) return fail("Dados inválidos.");
  const ctx = await getSessionContext();
  if (!ctx) return fail("Sessão expirada.");
  const supabase = await createClient();
  const { data: card } = await supabase.from("flashcards").select("id, workspace_id, ease_factor, interval_days, repetitions_count, correct_count, wrong_count").eq("id", cardId).maybeSingle();
  if (!card) return fail("Cartão não encontrado.");

  const settings = resolveSrsSettings(ctx.preferences?.srs_settings);
  const out = reviewCard({ ease_factor: Number(card.ease_factor), interval_days: card.interval_days, repetitions_count: card.repetitions_count }, rating, settings);

  const { data: updated, error } = await supabase
    .from("flashcards")
    .update({
      ease_factor: out.ease_factor,
      interval_days: out.interval_days,
      repetitions_count: out.repetitions_count,
      next_review_at: out.next_review_at.toISOString(),
      last_reviewed_at: new Date().toISOString(),
      correct_count: card.correct_count + (out.was_correct ? 1 : 0),
      wrong_count: card.wrong_count + (out.was_correct ? 0 : 1),
    })
    .eq("id", cardId)
    .select("id");
  if (error) return fail(friendlyDbError(error));
  if (!updated?.length) return fail("Você não tem permissão para revisar este cartão neste workspace.");

  await supabase.from("flashcard_reviews").insert({
    workspace_id: card.workspace_id,
    created_by: ctx.user.id,
    flashcard_id: cardId,
    rating,
    was_correct: out.was_correct,
    interval_before: card.interval_days,
    interval_after: out.interval_days,
    ease_after: out.ease_factor,
  });
  return { ok: true, data: { next_review_at: out.next_review_at.toISOString(), interval_days: out.interval_days } };
}

const quizSchema = z.object({
  title: z.string().trim().max(200).optional(),
  subjectId: UUID.nullable().optional(),
  topic: z.string().trim().max(200).nullable().optional(),
  difficulty: z.enum(["facil", "medio", "dificil"]).nullable().optional(),
  types: z.array(z.enum(["objetiva", "discursiva"])).min(1, "Selecione ao menos um tipo de questão."),
  count: z.number().int().min(1).max(100),
  timeLimit: z.number().int().min(1).max(600).nullable().optional(),
  onlyWrong: z.boolean().optional(),
});

export async function createQuizAction(input: z.input<typeof quizSchema>): Promise<ActionResult<{ id: string }>> {
  const parsed = quizSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Dados inválidos.");
  const d = parsed.data;
  const ctx = await getSessionContext();
  if (!ctx) return fail("Sessão expirada.");
  if (!canWrite(ctx.workspace.role)) return fail("Seu papel neste workspace é somente leitura.");
  const supabase = await createClient();

  let q = supabase.from("questions").select("id").eq("workspace_id", ctx.workspace.id).in("question_type", d.types).limit(2000);
  if (d.subjectId) q = q.eq("subject_id", d.subjectId);
  if (d.topic) q = q.ilike("topic", `%${d.topic.replace(/[%_]/g, "")}%`);
  if (d.difficulty) q = q.eq("difficulty", d.difficulty);
  const { data: pool, error } = await q;
  if (error) return fail(friendlyDbError(error));
  let ids = ((pool ?? []) as { id: string }[]).map((r) => r.id);

  if (d.onlyWrong) {
    const { data: attempts } = await supabase.from("quiz_attempts").select("answers").eq("workspace_id", ctx.workspace.id).eq("created_by", ctx.user.id).order("finished_at", { ascending: false }).limit(50);
    const wrong = new Set<string>();
    for (const a of (attempts ?? []) as { answers: { question_id: string; correct: boolean | null }[] }[]) for (const x of a.answers) if (x.correct === false) wrong.add(x.question_id);
    ids = ids.filter((id) => wrong.has(id));
  }
  if (ids.length === 0) return fail("Nenhuma questão cadastrada corresponde aos filtros. Cadastre questões ou ajuste os filtros.");

  const selected = shuffle(ids).slice(0, d.count);
  const { data: quiz, error: qErr } = await supabase
    .from("quizzes")
    .insert({
      workspace_id: ctx.workspace.id,
      created_by: ctx.user.id,
      title: d.title || `Simulado de ${new Date().toLocaleDateString("pt-BR")}${d.topic ? ` — ${d.topic}` : ""}`,
      subject_id: d.subjectId ?? null,
      topic: d.topic ?? null,
      time_limit_minutes: d.timeLimit ?? null,
    })
    .select("id")
    .single();
  if (qErr || !quiz) return fail(friendlyDbError(qErr));
  const { error: qqErr } = await supabase.from("quiz_questions").insert(selected.map((qid, i) => ({ quiz_id: quiz.id, question_id: qid, position: i, workspace_id: ctx.workspace.id, created_by: ctx.user.id })));
  if (qqErr) return fail(friendlyDbError(qqErr));
  revalidatePath("/simulados");
  return { ok: true, data: { id: quiz.id as string } };
}

const answerSchema = z.array(
  z.object({
    question_id: UUID,
    selected_option: z.number().int().min(0).max(9).nullable().optional(),
    text_answer: z.string().max(20000).nullable().optional(),
    self_assessed: z.enum(["correta", "parcial", "incorreta"]).nullable().optional(),
  }),
).max(100);

export async function submitQuizAction(quizId: string, startedAt: string, answers: z.input<typeof answerSchema>): Promise<ActionResult<{ attemptId: string }>> {
  if (!UUID.safeParse(quizId).success) return fail("Simulado inválido.");
  const parsed = answerSchema.safeParse(answers);
  if (!parsed.success) return fail("Respostas inválidas.");
  const started = new Date(startedAt);
  if (Number.isNaN(started.getTime())) return fail("Horário de início inválido.");
  const ctx = await getSessionContext();
  if (!ctx) return fail("Sessão expirada.");
  const supabase = await createClient();

  const { data: quiz } = await supabase.from("quizzes").select("id, workspace_id").eq("id", quizId).maybeSingle();
  if (!quiz) return fail("Simulado não encontrado.");
  const { data: qq } = await supabase.from("quiz_questions").select("question_id, questions(id, question_type, options, correct_option)").eq("quiz_id", quizId).order("position");
  type QQ = { question_id: string; questions: QuizQuestion | QuizQuestion[] | null };
  const questions = ((qq ?? []) as unknown as QQ[]).map((r) => (Array.isArray(r.questions) ? r.questions[0] : r.questions)).filter((x): x is QuizQuestion => Boolean(x));

  // Correção sempre no servidor, com o gabarito do banco.
  const result = gradeQuiz(questions, parsed.data);
  const now = new Date();
  const { data: attempt, error } = await supabase
    .from("quiz_attempts")
    .insert({
      workspace_id: quiz.workspace_id,
      created_by: ctx.user.id,
      quiz_id: quizId,
      started_at: started.toISOString(),
      finished_at: now.toISOString(),
      duration_seconds: Math.max(0, Math.round((now.getTime() - started.getTime()) / 1000)),
      answers: result.answers,
      objective_total: result.objective_total,
      objective_correct: result.objective_correct,
      discursive_total: result.discursive_total,
      score_percent: result.score_percent,
    })
    .select("id")
    .single();
  if (error || !attempt) return fail(friendlyDbError(error));
  revalidatePath("/simulados");
  return { ok: true, data: { attemptId: attempt.id as string } };
}

export async function deleteQuizAction(quizId: string): Promise<ActionResult> {
  if (!UUID.safeParse(quizId).success) return fail("Simulado inválido.");
  const supabase = await createClient();
  const { data, error } = await supabase.from("quizzes").delete().eq("id", quizId).select("id");
  if (error) return fail(friendlyDbError(error));
  if (!data?.length) return fail("Sem permissão para excluir.");
  revalidatePath("/simulados");
  return { ok: true, data: null };
}
