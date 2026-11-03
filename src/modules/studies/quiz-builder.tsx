"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox, Input, Label, NativeSelect } from "@/components/ui/input";
import { createQuizAction } from "./actions";

export function QuizBuilder({ subjects, topics, defaults, total }: {
  subjects: { id: string; name: string }[];
  topics: string[];
  defaults: { subjectId?: string; topic?: string };
  total: number;
}) {
  const router = useRouter();
  const [subjectId, setSubjectId] = React.useState(defaults.subjectId ?? "");
  const [topic, setTopic] = React.useState(defaults.topic ?? "");
  const [difficulty, setDifficulty] = React.useState("");
  const [count, setCount] = React.useState(10);
  const [objective, setObjective] = React.useState(true);
  const [discursive, setDiscursive] = React.useState(true);
  const [timed, setTimed] = React.useState(false);
  const [minutes, setMinutes] = React.useState(30);
  const [onlyWrong, setOnlyWrong] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const res = await createQuizAction({
          subjectId: subjectId || null,
          topic: topic || null,
          difficulty: (difficulty || null) as "facil" | "medio" | "dificil" | null,
          types: [...(objective ? ["objetiva" as const] : []), ...(discursive ? ["discursiva" as const] : [])],
          count,
          timeLimit: timed ? minutes : null,
          onlyWrong,
        });
        setBusy(false);
        if (!res.ok) return void toast.error(res.error);
        router.push(`/simulados/${res.data.id}`);
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="q-subject">Disciplina</Label>
          <NativeSelect id="q-subject" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
            <option value="">Todas</option>
            {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="q-topic">Assunto</Label>
          <Input id="q-topic" list="q-topics" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Ex.: joelho, LCA, neurofuncional" />
          <datalist id="q-topics">{topics.map((t) => <option key={t} value={t} />)}</datalist>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="q-diff">Dificuldade</Label>
          <NativeSelect id="q-diff" value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
            <option value="">Todas</option><option value="facil">Fácil</option><option value="medio">Médio</option><option value="dificil">Difícil</option>
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="q-count">Número de questões</Label>
          <Input id="q-count" type="number" min={1} max={100} value={count} onChange={(e) => setCount(Math.max(1, Math.min(100, Number(e.target.value) || 1)))} />
        </div>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <label className="flex items-center gap-2"><Checkbox checked={objective} onChange={(e) => setObjective(e.target.checked)} /> Objetivas</label>
        <label className="flex items-center gap-2"><Checkbox checked={discursive} onChange={(e) => setDiscursive(e.target.checked)} /> Discursivas</label>
        <label className="flex items-center gap-2"><Checkbox checked={onlyWrong} onChange={(e) => setOnlyWrong(e.target.checked)} /> Somente questões que errei</label>
        <label className="flex items-center gap-2"><Checkbox checked={timed} onChange={(e) => setTimed(e.target.checked)} /> Cronometrar</label>
        {timed && (
          <label className="flex items-center gap-2">
            <Input type="number" min={1} max={600} value={minutes} onChange={(e) => setMinutes(Math.max(1, Number(e.target.value) || 1))} className="h-8 w-20" aria-label="Minutos" /> minutos
          </label>
        )}
      </div>
      <Button type="submit" size="lg" disabled={busy || total === 0} className="w-full sm:w-auto">
        {busy ? <Loader2 className="animate-spin" /> : <Timer />} TESTAR MEUS CONHECIMENTOS
      </Button>
      {total === 0 && <p className="text-sm text-muted-foreground">Cadastre questões no Banco de questões para gerar simulados.</p>}
    </form>
  );
}
