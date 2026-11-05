import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, Plus } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DEADLINE_LEGEND, TONE_BG, TONE_TEXT, deadlineTone, progressTone } from "@/lib/domain/status";
import { Icon } from "@/components/shared/icon";
import { StatTile, ListCard, ListRow } from "@/components/dashboard/widgets";
import { TrendLines, ChartTable } from "@/components/charts/charts";
import { requireSession } from "@/lib/session";
import { canWrite } from "@/lib/permissions";
import { formatDate, formatDateTime, formatLong, formatRelative } from "@/lib/utils/format";
import { getDashboardData } from "@/modules/dashboard/queries";
import { toneFor } from "@/modules/entities/components/field-value";
import { ENTITY_MAP, optionLabel } from "@/modules/entities/definitions";

export const metadata: Metadata = { title: "Dashboard" };

const QUICK = [
  { label: "Novo artigo", href: "/artigos/novo", icon: "FileText" },
  { label: "Nova disciplina", href: "/disciplinas/novo", icon: "BookOpen" },
  { label: "Nova anotação", href: "/caderno/novo", icon: "NotebookPen" },
  { label: "Nova tarefa", href: "/tarefas/novo", icon: "ListChecks" },
  { label: "Novo caso clínico", href: "/casos-clinicos/novo", icon: "HeartPulse" },
  { label: "Nova patologia", href: "/patologias/novo", icon: "Activity" },
  { label: "Novo exercício", href: "/exercicios/novo", icon: "Dumbbell" },
  { label: "Novo projeto", href: "/projetos/novo", icon: "KanbanSquare" },
  { label: "Novo evento", href: "/eventos/novo", icon: "CalendarDays" },
];

const SERIES = [
  { key: "revisoes", label: "Revisões de flashcards" },
  { key: "anotacoes", label: "Anotações criadas" },
  { key: "artigos", label: "Artigos lidos" },
  { key: "simulados", label: "Simulados feitos" },
];

export default async function DashboardPage() {
  const ctx = await requireSession();
  const d = await getDashboardData(ctx.workspace.id);
  const firstName = (ctx.profile?.full_name ?? "").split(" ")[0];
  const statusOf = (key: string, field: string, v: string) => optionLabel(ENTITY_MAP[key].fields.find((f) => f.name === field)!, v);
  const hasEvolution = d.evolution.some((w) => w.revisoes + w.anotacoes + w.artigos + w.simulados > 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <p className="text-sm capitalize text-muted-foreground">{formatLong(new Date())}</p>
        <h1 className="text-2xl font-semibold tracking-tight">Olá{firstName ? `, ${firstName}` : ""}!</h1>
        <p className="text-sm text-muted-foreground">Workspace: <span className="text-foreground">{ctx.workspace.name}</span></p>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Legenda de prazos">
        <span className="font-medium text-foreground">Prazos:</span>
        {DEADLINE_LEGEND.map((l) => (
          <span key={l.label} className="inline-flex items-center gap-1.5"><span className={`size-2.5 rounded-full ${TONE_BG[l.tone]}`} />{l.label}</span>
        ))}
      </div>
      <section aria-label="Indicadores" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Disciplinas" value={d.stats.subjects} icon="BookOpen" href="/disciplinas" tone="primary" />
        <StatTile label="Artigos científicos" value={d.stats.articles} icon="FileText" href="/artigos" tone="info" />
        <StatTile label="Casos clínicos" value={d.stats.cases} icon="HeartPulse" href="/casos-clinicos" tone="primary" />
        <StatTile label="Patologias estudadas" value={d.stats.pathologiesStudied} icon="Activity" href="/patologias?study_status=estudado" hint={`de ${d.stats.pathologies} cadastradas`} />
        <StatTile label="Exercícios" value={d.stats.exercises} icon="Dumbbell" href="/exercicios" tone="info" />
        <StatTile label="Tarefas pendentes" value={d.stats.pendingTasks} icon="ListChecks" href="/tarefas?status=pendente" tone={d.stats.overdueTasks > 0 ? "danger" : d.stats.pendingTasks > 0 ? "warning" : "success"} hint={d.stats.overdueTasks > 0 ? `${d.stats.overdueTasks} atrasada(s)` : undefined} />
        <StatTile label="Projetos em andamento" value={d.stats.activeProjects} icon="KanbanSquare" href="/projetos" tone="info" />
        <StatTile label="Anotações" value={d.stats.notes} icon="NotebookPen" href="/caderno" tone="primary" />
      </section>

      {canWrite(ctx.workspace.role) && (
        <section aria-label="Ações rápidas">
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
            {QUICK.map((q) => (
              <Link key={q.href} href={q.href} className="flex shrink-0 items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium hover:border-primary/40 hover:text-primary">
                <Plus className="size-3.5" /> <Icon name={q.icon} className="size-3.5" /> {q.label}
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div><CardTitle>Minha semana</CardTitle><CardDescription>Próximos 7 dias: aulas, provas, prazos e atividades.</CardDescription></div>
            <Link href="/semana" className="text-xs text-primary hover:underline">Abrir semana</Link>
          </CardHeader>
          <CardContent>
            {d.week.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nada agendado para os próximos 7 dias. <Link href="/eventos/novo" className="text-primary hover:underline">Adicionar evento</Link></p>
            ) : (
              <ul className="divide-y divide-border">
                {d.week.slice(0, 8).map((w) => (
                  <ListRow key={w.key} href={w.href} title={w.title} meta={formatDateTime(w.start)} right={<Badge tone={w.kind === "prova" ? "warning" : w.kind === "tarefa" ? "info" : "neutral"}>{w.kind}</Badge>} />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <ListCard title="Próximas provas" href="/provas" empty="Nenhuma avaliação nos próximos 30 dias.">
          {d.exams.map((e) => (
            <ListRow key={e.href} href={e.href} title={e.title} meta={<span className="inline-flex items-center gap-1"><CalendarClock className="size-3" /> {formatDateTime(e.date)} · {formatRelative(e.date)}</span>} right={<span className={`size-2.5 rounded-full ${TONE_BG[deadlineTone(e.date)]}`} aria-label={deadlineTone(e.date) === "warning" ? "Atenção" : deadlineTone(e.date) === "danger" ? "Atrasado" : "Em dia"} />} />
          ))}
        </ListCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <ListCard title="Atividades pendentes" href="/tarefas" empty="Nenhuma tarefa pendente.">
          {d.tasks.map((t) => (
            <ListRow key={t.id} href={`/tarefas/${t.id}`} title={t.title} meta={t.due_at ? `Prazo ${formatDateTime(t.due_at)}` : "Sem prazo"} right={<Badge tone={deadlineTone(t.due_at, t.status)}>{deadlineTone(t.due_at, t.status) === "danger" ? "Atrasada" : deadlineTone(t.due_at, t.status) === "warning" ? "Breve" : deadlineTone(t.due_at, t.status) === "success" ? "Em dia" : t.priority}</Badge>} />
          ))}
        </ListCard>
        <ListCard title="Trabalhos próximos do prazo" href="/projetos" empty="Nenhum prazo nas próximas 3 semanas.">
          {d.dueProjects.map((p) => (
            <ListRow key={p.id} href={`/projetos/${p.id}`} title={p.name} meta={`Prazo ${formatDate(p.due_date)}`} right={<Badge tone={toneFor(p.status)}>{statusOf("projects", "status", p.status)}</Badge>} />
          ))}
        </ListCard>
        <ListCard title="Projetos em andamento" href="/projetos" empty="Nenhum projeto em andamento.">
          {d.projects.map((p) => (
            <ListRow key={p.id} href={`/projetos/${p.id}`} title={p.name} meta={p.due_date ? `Prazo ${formatDate(p.due_date)}` : "Sem prazo"} />
          ))}
        </ListCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ListCard title="Artigos adicionados recentemente" href="/artigos" empty="Nenhum artigo cadastrado.">
          {d.recentArticles.map((a) => (
            <ListRow key={a.id} href={`/artigos/${a.id}`} title={a.title} meta={[a.authors?.split(";")[0], a.year].filter(Boolean).join(" · ")} right={<Badge tone={toneFor(a.reading_status)}>{statusOf("articles", "reading_status", a.reading_status)}</Badge>} />
          ))}
        </ListCard>
        <ListCard title="Últimos conteúdos estudados" href="/caderno" empty="Nenhuma anotação ainda.">
          {d.recentNotes.map((n) => (
            <ListRow key={n.id} href={`/caderno/${n.id}`} title={n.title} meta={`${n.topic ? `${n.topic} · ` : ""}${formatRelative(n.updated_at)}`} right={<Badge tone={toneFor(n.study_status)}>{statusOf("study_notes", "study_status", n.study_status)}</Badge>} />
          ))}
        </ListCard>
      </div>

      <Card>
        <CardHeader><div><CardTitle>Evolução semanal</CardTitle><CardDescription>Atividade registrada nas últimas 8 semanas (dados reais do workspace).</CardDescription></div></CardHeader>
        <CardContent>
          {hasEvolution ? (
            <>
              <TrendLines data={d.evolution} series={SERIES} />
              <ChartTable data={d.evolution} series={SERIES} xLabel="Semana (início)" />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">O gráfico aparecerá conforme você revisar flashcards, criar anotações, ler artigos e fazer simulados.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
