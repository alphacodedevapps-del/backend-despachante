import type * as React from "react";
import Link from "next/link";
import { Layers, Timer } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import type { SessionContext } from "@/lib/session";
import { canEditRow } from "@/lib/permissions";
import { KanbanBoard, type KanbanCard } from "@/modules/projects/kanban";
import { ENTITY_MAP, optionLabel } from "./definitions";
import type { ResolvedRoute } from "./resolve";
import type { Row } from "./queries";

interface Props {
  ctx: SessionContext;
  route: ResolvedRoute;
  rows: Row[];
  searchParams: Record<string, string>;
}

async function ProjectsBoard({ ctx, route }: Props) {
  const supabase = await createClient();
  let q = supabase.from("projects").select("id, name, status, project_type, due_date, created_by").eq("workspace_id", ctx.workspace.id).order("due_date", { nullsFirst: false }).limit(300);
  if (route.view) q = q.in(route.view.filter.field, route.view.filter.values);
  const { data } = await q;
  const projects = (data ?? []) as { id: string; name: string; status: string; project_type: string; due_date: string | null; created_by: string | null }[];
  const { data: stages } = projects.length ? await supabase.from("project_stages").select("project_id, is_done").in("project_id", projects.map((p) => p.id)) : { data: [] };
  const prog = new Map<string, { t: number; d: number }>();
  for (const s of (stages ?? []) as { project_id: string; is_done: boolean }[]) {
    const p = prog.get(s.project_id) ?? { t: 0, d: 0 };
    p.t++;
    if (s.is_done) p.d++;
    prog.set(s.project_id, p);
  }
  const typeField = ENTITY_MAP.projects.fields.find((f) => f.name === "project_type")!;
  const cards: KanbanCard[] = projects.map((p) => {
    const s = prog.get(p.id);
    return { id: p.id, name: p.name, status: p.status, typeLabel: optionLabel(typeField, p.project_type), due_date: p.due_date, progress: s ? Math.round((s.d / s.t) * 100) : null, editable: canEditRow(ctx.workspace.role, p.created_by, ctx.user.id) };
  });
  if (cards.length === 0) return null;
  return (
    <>
      <h2 className="mb-2 text-sm font-semibold">Quadro Kanban <span className="font-normal text-muted-foreground">— arraste os cartões entre colunas (no celular, use o seletor)</span></h2>
      <KanbanBoard cards={cards} />
      <h2 className="mb-2 text-sm font-semibold">Lista</h2>
    </>
  );
}

async function FlashcardsBanner({ ctx }: Props) {
  const supabase = await createClient();
  const { count } = await supabase.from("flashcards").select("id", { count: "exact", head: true }).eq("workspace_id", ctx.workspace.id).lte("next_review_at", new Date().toISOString());
  return (
    <Card className={`mb-4 border-l-4 ${(count ?? 0) > 0 ? "border-l-warning bg-warning-soft" : "border-l-success bg-success-soft"}`}>
      <CardContent className="flex flex-col gap-3 pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm">{(count ?? 0) > 0 ? <><strong className="text-lg tabular-nums text-warning">{count}</strong> cartão(ões) aguardando revisão hoje.</> : <span className="font-medium text-success">Tudo revisado por hoje ✓</span>}</p>
        <Link href="/revisao-flashcards" className={buttonVariants()}><Layers /> Iniciar revisão</Link>
      </CardContent>
    </Card>
  );
}

function QuestionsBanner() {
  return (
    <Card className="mb-4">
      <CardContent className="flex flex-col gap-3 pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">Monte simulados com as questões cadastradas, filtrando por disciplina e assunto.</p>
        <Link href="/simulados" className={buttonVariants()}><Timer /> TESTAR MEUS CONHECIMENTOS</Link>
      </CardContent>
    </Card>
  );
}

export const CUSTOM_LISTS: Record<string, (props: Props) => React.ReactNode | Promise<React.ReactNode>> = {
  projects: ProjectsBoard,
  flashcards: FlashcardsBanner,
  questions: QuestionsBanner,
};
