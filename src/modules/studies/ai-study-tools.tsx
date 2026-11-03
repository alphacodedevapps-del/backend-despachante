"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Layers, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { createRecordAction } from "@/modules/entities/actions";
import { generateFromRecordAction, type GeneratedFlashcard, type GeneratedQuestion } from "@/modules/assistant/actions";

type Kind = "flashcards" | "questoes" | "fichamento" | "resumo" | "roteiro";
const LABELS: Record<Kind, string> = {
  flashcards: "Gerar flashcards",
  questoes: "Gerar questões",
  fichamento: "Gerar fichamento",
  resumo: "Gerar resumo",
  roteiro: "Roteiro de revisão",
};

/**
 * Ferramentas de IA para estudo a partir de um registro. Tudo que a IA gera
 * é exibido para revisão e só é salvo após aprovação explícita.
 */
export function AiStudyTools({ type, id, kinds, aiConfigured, subjectId, articleId, defaultTopic, editable }: {
  type: string;
  id: string;
  kinds: Kind[];
  aiConfigured: boolean;
  subjectId?: string | null;
  articleId?: string | null;
  defaultTopic?: string | null;
  editable: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = React.useState<Kind | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [cards, setCards] = React.useState<(GeneratedFlashcard & { keep: boolean })[]>([]);
  const [questions, setQuestions] = React.useState<(GeneratedQuestion & { keep: boolean })[]>([]);
  const [text, setText] = React.useState<{ kind: Kind; value: string } | null>(null);
  const [saving, setSaving] = React.useState(false);

  const run = async (kind: Kind) => {
    setLoading(kind);
    setError(null);
    const res = await generateFromRecordAction(type, id, kind);
    setLoading(null);
    if (!res.ok) return setError(res.error);
    if (res.data.flashcards) setCards(res.data.flashcards.map((c) => ({ ...c, keep: true })));
    if (res.data.questions) setQuestions(res.data.questions.map((q) => ({ ...q, keep: true })));
    if (res.data.text) setText({ kind, value: res.data.text });
  };

  const saveAll = async () => {
    setSaving(true);
    let ok = 0;
    for (const c of cards.filter((c) => c.keep)) {
      const r = await createRecordAction("flashcards", { front: c.front, back: c.back, topic: c.topic || defaultTopic || "", subject_id: subjectId ?? "", difficulty: "medio" });
      if (r.ok) ok++;
    }
    for (const q of questions.filter((q) => q.keep)) {
      const r = await createRecordAction("questions", {
        statement: q.statement,
        question_type: "objetiva",
        options: q.options,
        correct_option: q.correct_option,
        explanation: `${q.explanation}\n\n(Gerada por IA a partir de "${defaultTopic ?? "registro"}" — revise.)`,
        subject_id: subjectId ?? "",
        topic: defaultTopic ?? "",
        difficulty: "medio",
      });
      if (r.ok) ok++;
    }
    if (text) {
      const now = new Date().toLocaleDateString("pt-BR");
      const content = `${text.value}\n\n---\nConteúdo gerado por IA em ${now} a partir dos materiais do workspace. Revise e valide com as fontes originais.`;
      const r =
        text.kind === "fichamento" && articleId
          ? await createRecordAction("article_notes", { article_id: articleId, title: `Fichamento (IA) — ${now}`, note_type: "resumo", content })
          : await createRecordAction("study_notes", { title: `${LABELS[text.kind].replace("Gerar ", "")} (IA) — ${defaultTopic ?? now}`.slice(0, 200), subject_id: subjectId ?? "", topic: defaultTopic ?? "", note_type: "resumo", study_status: "revisar", content });
      if (r.ok) ok++;
    }
    setSaving(false);
    toast.success(`${ok} item(ns) salvo(s).`);
    setCards([]);
    setQuestions([]);
    setText(null);
    router.refresh();
  };

  const hasResults = cards.length > 0 || questions.length > 0 || text;

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2"><Sparkles className="size-4 text-primary" /> Estudar com IA</CardTitle>
          <CardDescription>Gera materiais a partir deste registro e dos anexos indexados. Você revisa antes de salvar.</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {!aiConfigured && <Alert tone="info">A integração de IA não está configurada no servidor. Os botões ficam disponíveis assim que ela for configurada.</Alert>}
        <div className="flex flex-wrap gap-2">
          {kinds.map((k) => (
            <Button key={k} variant="outline" size="sm" disabled={!aiConfigured || !!loading || !editable} onClick={() => run(k)}>
              {loading === k ? <Loader2 className="animate-spin" /> : <Layers />} {LABELS[k]}
            </Button>
          ))}
        </div>
        {error && <Alert tone="danger">{error}</Alert>}

        {cards.length > 0 && (
          <ul className="space-y-2">
            {cards.map((c, i) => (
              <li key={i} className="flex gap-2 rounded-md border border-border p-2 text-sm">
                <input type="checkbox" className="mt-1 size-4 accent-[var(--primary)]" checked={c.keep} onChange={(e) => setCards(cards.map((x, j) => (j === i ? { ...x, keep: e.target.checked } : x)))} aria-label="Manter flashcard" />
                <div><p className="font-medium">{c.front}</p><p className="text-muted-foreground">{c.back}</p></div>
              </li>
            ))}
          </ul>
        )}
        {questions.length > 0 && (
          <ul className="space-y-2">
            {questions.map((q, i) => (
              <li key={i} className="flex gap-2 rounded-md border border-border p-2 text-sm">
                <input type="checkbox" className="mt-1 size-4 accent-[var(--primary)]" checked={q.keep} onChange={(e) => setQuestions(questions.map((x, j) => (j === i ? { ...x, keep: e.target.checked } : x)))} aria-label="Manter questão" />
                <div>
                  <p className="font-medium">{q.statement}</p>
                  <ol className="mt-1 list-[upper-alpha] pl-5">
                    {q.options.map((o, k) => (
                      <li key={k} className={k === q.correct_option ? "font-medium text-success" : ""}>{o}</li>
                    ))}
                  </ol>
                </div>
              </li>
            ))}
          </ul>
        )}
        {text && <div className="max-h-96 overflow-y-auto whitespace-pre-wrap rounded-md bg-surface-muted p-3 text-sm">{text.value}</div>}
        {hasResults && (
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => { setCards([]); setQuestions([]); setText(null); }}>Descartar</Button>
            <Button size="sm" disabled={saving} onClick={saveAll}>{saving && <Loader2 className="animate-spin" />} Salvar selecionados</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
