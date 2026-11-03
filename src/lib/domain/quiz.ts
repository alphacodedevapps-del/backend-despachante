/** Correção de simulados (executada no servidor). */

export interface QuizQuestion {
  id: string;
  question_type: "objetiva" | "discursiva";
  options: string[];
  correct_option: number | null;
}

export interface SubmittedAnswer {
  question_id: string;
  selected_option?: number | null;
  text_answer?: string | null;
  /** Autoavaliação de questões discursivas após ver a resposta esperada. */
  self_assessed?: "correta" | "parcial" | "incorreta" | null;
}

export interface GradedAnswer extends SubmittedAnswer {
  correct: boolean | null;
}

export interface QuizResult {
  answers: GradedAnswer[];
  objective_total: number;
  objective_correct: number;
  discursive_total: number;
  score_percent: number | null;
}

export function gradeQuiz(questions: QuizQuestion[], submitted: SubmittedAnswer[]): QuizResult {
  const byId = new Map(submitted.map((a) => [a.question_id, a]));
  let objTotal = 0;
  let objCorrect = 0;
  let discTotal = 0;
  let discPoints = 0;
  let discAssessed = 0;

  const answers: GradedAnswer[] = questions.map((q) => {
    const a = byId.get(q.id) ?? { question_id: q.id };
    if (q.question_type === "objetiva") {
      objTotal++;
      const sel = typeof a.selected_option === "number" ? a.selected_option : null;
      const correct = sel !== null && q.correct_option !== null && sel === q.correct_option;
      if (correct) objCorrect++;
      return { question_id: q.id, selected_option: sel, correct };
    }
    discTotal++;
    const sa = a.self_assessed ?? null;
    if (sa) {
      discAssessed++;
      discPoints += sa === "correta" ? 1 : sa === "parcial" ? 0.5 : 0;
    }
    return {
      question_id: q.id,
      text_answer: (a.text_answer ?? "").slice(0, 20000),
      self_assessed: sa,
      correct: sa === null ? null : sa === "correta",
    };
  });

  const denom = objTotal + discAssessed;
  const score = denom > 0 ? Math.round(((objCorrect + discPoints) / denom) * 10000) / 100 : null;
  return { answers, objective_total: objTotal, objective_correct: objCorrect, discursive_total: discTotal, score_percent: score };
}

/** Embaralhamento determinístico opcional (Fisher–Yates). */
export function shuffle<T>(items: T[], random: () => number = Math.random): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
