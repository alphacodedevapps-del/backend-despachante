"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Alert } from "@/components/ui/alert";
import { cn } from "@/lib/utils/cn";
import { submitQuizAction } from "./actions";

export interface RunnerQuestion {
  id: string;
  statement: string;
  question_type: "objetiva" | "discursiva";
  options: string[];
  expected_answer: string | null;
}

type Answer = { selected_option?: number | null; text_answer?: string; self_assessed?: "correta" | "parcial" | "incorreta" | null };

export function QuizRunner({ quizId, questions, timeLimitMinutes }: { quizId: string; questions: RunnerQuestion[]; timeLimitMinutes: number | null }) {
  const router = useRouter();
  const startedAt = React.useRef(new Date().toISOString());
  const [answers, setAnswers] = React.useState<Record<string, Answer>>({});
  const [phase, setPhase] = React.useState<"answering" | "self-review">("answering");
  const [busy, setBusy] = React.useState(false);
  const [remaining, setRemaining] = React.useState(timeLimitMinutes ? timeLimitMinutes * 60 : null);
  const submitted = React.useRef(false);

  const set = (id: string, patch: Answer) => setAnswers((a) => ({ ...a, [id]: { ...a[id], ...patch } }));
  const discursive = questions.filter((q) => q.question_type === "discursiva");
  const answered = questions.filter((q) => (q.question_type === "objetiva" ? typeof answers[q.id]?.selected_option === "number" : (answers[q.id]?.text_answer ?? "").trim())).length;

  const submit = React.useCallback(async () => {
    if (submitted.current) return;
    submitted.current = true;
    setBusy(true);
    const res = await submitQuizAction(
      quizId,
      startedAt.current,
      questions.map((q) => ({ question_id: q.id, selected_option: answers[q.id]?.selected_option ?? null, text_answer: answers[q.id]?.text_answer ?? null, self_assessed: answers[q.id]?.self_assessed ?? null })),
    );
    setBusy(false);
    if (!res.ok) {
      submitted.current = false;
      return void toast.error(res.error);
    }
    router.push(`/simulados/resultado/${res.data.attemptId}`);
  }, [answers, questions, quizId, router]);

  React.useEffect(() => {
    if (remaining === null) return;
    if (remaining <= 0) {
      toast.warning("Tempo esgotado — simulado enviado.");
      void submit();
      return;
    }
    const t = setTimeout(() => setRemaining((r) => (r === null ? null : r - 1)), 1000);
    return () => clearTimeout(t);
  }, [remaining, submit]);

  const finish = () => {
    if (phase === "answering" && discursive.length > 0) setPhase("self-review");
    else void submit();
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="sticky top-14 z-10 -mx-4 flex items-center justify-between gap-3 border-b border-border bg-background/90 px-4 py-2 backdrop-blur sm:mx-0 sm:rounded-lg sm:border">
        <span className="text-sm text-muted-foreground">{answered}/{questions.length} respondidas</span>
        {remaining !== null && (
          <span className={cn("flex items-center gap-1 text-sm font-semibold tabular-nums", remaining < 60 && "text-danger")} aria-live="polite">
            <Timer className="size-4" /> {String(Math.floor(remaining / 60)).padStart(2, "0")}:{String(remaining % 60).padStart(2, "0")}
          </span>
        )}
        <Button size="sm" onClick={finish} disabled={busy}>{busy && <Loader2 className="animate-spin" />}{phase === "answering" && discursive.length ? "Concluir respostas" : "Enviar e corrigir"}</Button>
      </div>
      <Progress value={(answered / Math.max(1, questions.length)) * 100} label="Questões respondidas" />

      {phase === "self-review" && <Alert tone="info" title="Autoavaliação das discursivas">Compare sua resposta com a resposta esperada e indique o resultado. Depois envie para ver a correção completa.</Alert>}

      {questions.map((q, i) => (
        <section key={q.id} className="rounded-lg border border-border bg-surface p-4 sm:p-5" aria-labelledby={`q-${q.id}`}>
          <p id={`q-${q.id}`} className="mb-3 whitespace-pre-wrap font-medium"><span className="text-muted-foreground">{i + 1}.</span> {q.statement}</p>
          {q.question_type === "objetiva" ? (
            <fieldset className="space-y-2" disabled={phase === "self-review"}>
              <legend className="sr-only">Alternativas</legend>
              {q.options.map((o, k) => (
                <label key={k} className={cn("flex cursor-pointer items-start gap-2 rounded-md border border-border p-2.5 text-sm hover:bg-surface-muted", answers[q.id]?.selected_option === k && "border-primary bg-primary-soft")}>
                  <input type="radio" name={q.id} className="mt-0.5 accent-[var(--primary)]" checked={answers[q.id]?.selected_option === k} onChange={() => set(q.id, { selected_option: k })} />
                  <span><strong>{String.fromCharCode(65 + k)})</strong> {o}</span>
                </label>
              ))}
            </fieldset>
          ) : (
            <div className="space-y-3">
              <Textarea rows={5} value={answers[q.id]?.text_answer ?? ""} onChange={(e) => set(q.id, { text_answer: e.target.value })} disabled={phase === "self-review"} aria-label="Sua resposta" placeholder="Escreva sua resposta…" />
              {phase === "self-review" && (
                <>
                  <div className="rounded-md bg-surface-muted p-3 text-sm"><p className="mb-1 text-xs font-medium text-muted-foreground">Resposta esperada</p><p className="whitespace-pre-wrap">{q.expected_answer || "Nenhuma resposta esperada cadastrada."}</p></div>
                  <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Autoavaliação">
                    {(["correta", "parcial", "incorreta"] as const).map((v) => (
                      <Button key={v} size="sm" variant={answers[q.id]?.self_assessed === v ? "default" : "outline"} onClick={() => set(q.id, { self_assessed: v })} role="radio" aria-checked={answers[q.id]?.self_assessed === v}>
                        {v === "correta" ? "Acertei" : v === "parcial" ? "Parcial" : "Errei"}
                      </Button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </section>
      ))}

      <div className="flex justify-end">
        <Button size="lg" onClick={finish} disabled={busy}>{busy && <Loader2 className="animate-spin" />}{phase === "answering" && discursive.length ? "Concluir e autoavaliar discursivas" : "Enviar e ver correção"}</Button>
      </div>
    </div>
  );
}
