import type * as React from "react";
import Link from "next/link";
import { Layers, Timer } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import type { SessionContext } from "@/lib/session";
import { canEditRow } from "@/lib/permissions";
import { formatNumber } from "@/lib/utils/format";
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
    <Card className="mb-4">
      <CardContent className="flex flex-col gap-3 pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm"><strong className="text-lg tabular-nums">{count ?? 0}</strong> cartão(ões) aguardando revisão hoje.</p>
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

async function HoursSummary({ ctx }: Props) {
  const supabase = await createClient();
  const { data } = await supabase.from("complementary_activities").select("category, hours, status").eq("workspace_id", ctx.workspace.id).limit(5000);
  const rows = (data ?? []) as { category: string; hours: number; status: string }[];
  const field = ENTITY_MAP.complementary_activities.fields.find((f) => f.name === "category")!;
  const valid = rows.filter((r) => r.status !== "rejeitada");
  const total = valid.reduce((s, r) => s + Number(r.hours), 0);
  const validated = rows.filter((r) => r.status === "validada").reduce((s, r) => s + Number(r.hours), 0);
  const byCat = new Map<string, number>();
  for (const r of valid) byCat.set(r.category, (byCat.get(r.category) ?? 0) + Number(r.hours));
  return (
    <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Card><CardContent className="pt-5"><p className="text-xs text-muted-foreground">Total (exceto rejeitadas)</p><p className="text-2xl font-semibold tabular-nums">{formatNumber(total, 1)} h</p></CardContent></Card>
      <Card><CardContent className="pt-5"><p className="text-xs text-muted-foreground">Validadas</p><p className="text-2xl font-semibold tabular-nums">{formatNumber(validated, 1)} h</p></CardContent></Card>
      <Card className="sm:col-span-2"><CardContent className="pt-5 text-sm">
        <p className="mb-1 text-xs text-muted-foreground">Por categoria</p>
        {byCat.size === 0 ? <p className="text-muted-foreground">Sem registros.</p> : (
          <ul className="flex flex-wrap gap-x-4 gap-y-1">{Array.from(byCat.entries()).map(([k, v]) => <li key={k}>{optionLabel(field, k)}: <strong className="tabular-nums">{formatNumber(v, 1)} h</strong></li>)}</ul>
        )}
      </CardContent></Card>
    </div>
  );
}

export const CUSTOM_LISTS: Record<string, (props: Props) => React.ReactNode | Promise<React.ReactNode>> = {
  projects: ProjectsBoard,
  flashcards: FlashcardsBanner,
  questions: QuestionsBanner,
  complementary_activities: HoursSummary,
};
