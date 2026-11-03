"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { formatDate } from "@/lib/utils/format";
import { addStageAction, deleteStageAction, updateStageAction } from "./actions";

export interface Stage {
  id: string;
  title: string;
  is_done: boolean;
  position: number;
  due_date: string | null;
}

export function ProjectStages({ projectId, stages, editable }: { projectId: string; stages: Stage[]; editable: boolean }) {
  const router = useRouter();
  const [title, setTitle] = React.useState("");
  const [due, setDue] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);
  const done = stages.filter((s) => s.is_done).length;
  const pct = stages.length ? (done / stages.length) * 100 : 0;

  const run = async (key: string, fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setBusy(key);
    const res = await fn();
    setBusy(null);
    if (!res.ok) toast.error(res.error ?? "Erro.");
    else router.refresh();
    return res.ok;
  };

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Etapas do projeto</CardTitle>
          <CardDescription>{done} de {stages.length} concluídas</CardDescription>
        </div>
        <span className="text-sm font-semibold tabular-nums text-primary">{Math.round(pct)}%</span>
      </CardHeader>
      <CardContent className="space-y-3">
        <Progress value={pct} label="Progresso do projeto" />
        <ul className="divide-y divide-border">
          {stages.map((s, i) => (
            <li key={s.id} className="flex items-center gap-2 py-2">
              <input
                type="checkbox"
                className="size-4 accent-[var(--primary)]"
                checked={s.is_done}
                disabled={!editable || busy === s.id}
                aria-label={`Concluir ${s.title}`}
                onChange={(e) => run(s.id, () => updateStageAction(s.id, { is_done: e.target.checked }))}
              />
              <span className={`flex-1 text-sm ${s.is_done ? "text-muted-foreground line-through" : ""}`}>{s.title}</span>
              {s.due_date && <span className="text-xs text-muted-foreground tabular-nums">{formatDate(s.due_date)}</span>}
              {editable && (
                <>
                  <Button variant="ghost" size="icon-sm" aria-label="Mover para cima" disabled={i === 0 || !!busy}
                    onClick={() => run(s.id, async () => { await updateStageAction(stages[i - 1].id, { position: s.position }); return updateStageAction(s.id, { position: stages[i - 1].position === s.position ? s.position - 1 : stages[i - 1].position }); })}>
                    <ArrowUp />
                  </Button>
                  <Button variant="ghost" size="icon-sm" aria-label="Mover para baixo" disabled={i === stages.length - 1 || !!busy}
                    onClick={() => run(s.id, async () => { await updateStageAction(stages[i + 1].id, { position: s.position }); return updateStageAction(s.id, { position: stages[i + 1].position === s.position ? s.position + 1 : stages[i + 1].position }); })}>
                    <ArrowDown />
                  </Button>
                  <Button variant="ghost" size="icon-sm" aria-label="Excluir etapa" disabled={!!busy} onClick={() => run(s.id, () => deleteStageAction(s.id))}>
                    <Trash2 />
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
        {stages.length === 0 && <p className="text-sm text-muted-foreground">Crie etapas personalizadas para acompanhar o progresso.</p>}
        {editable && (
          <form
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await run("new", () => addStageAction(projectId, title, due || null))) {
                setTitle("");
                setDue("");
              }
            }}
          >
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nova etapa (ex.: revisão bibliográfica)" aria-label="Título da etapa" />
            <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="sm:w-44" aria-label="Prazo da etapa" />
            <Button type="submit" variant="outline" disabled={busy === "new"}>
              {busy === "new" ? <Loader2 className="animate-spin" /> : <Plus />} Adicionar
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
