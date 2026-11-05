import "server-only";
import { addDays, startOfDay, startOfWeek, subWeeks, format } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { expandOccurrences, type RecurringEvent } from "@/lib/domain/recurrence";

export interface AgendaItem {
  key: string;
  kind: "evento" | "tarefa" | "prova" | "projeto" | "liga";
  title: string;
  start: string;
  href: string;
  category?: string;
  priority?: string;
}

/** Agenda unificada (eventos com recorrência, tarefas, provas, projetos, liga) no intervalo. */
export async function getAgenda(workspaceId: string, from: Date, to: Date): Promise<AgendaItem[]> {
  const supabase = await createClient();
  const [events, tasks, exams, projects, league] = await Promise.all([
    supabase
      .from("events")
      .select("id, title, category, priority, start_at, end_at, recurrence, recurrence_until")
      .eq("workspace_id", workspaceId)
      .or(`and(start_at.gte.${from.toISOString()},start_at.lte.${to.toISOString()}),recurrence.neq.nenhuma`)
      .lte("start_at", to.toISOString())
      .limit(1000),
    supabase.from("tasks").select("id, title, due_at, priority, category, status").eq("workspace_id", workspaceId).gte("due_at", from.toISOString()).lte("due_at", to.toISOString()).neq("status", "cancelada").limit(500),
    supabase.from("assessments").select("id, title, assessment_date, status").eq("workspace_id", workspaceId).gte("assessment_date", from.toISOString()).lte("assessment_date", to.toISOString()).limit(200),
    supabase.from("projects").select("id, name, due_date, status").eq("workspace_id", workspaceId).gte("due_date", format(from, "yyyy-MM-dd")).lte("due_date", format(to, "yyyy-MM-dd")).limit(200),
    supabase.from("league_activities").select("id, title, starts_at, activity_type").eq("workspace_id", workspaceId).gte("starts_at", from.toISOString()).lte("starts_at", to.toISOString()).limit(200),
  ]);
  const items: AgendaItem[] = [];
  type Ev = RecurringEvent & { title: string; category: string; priority: string };
  for (const o of expandOccurrences((events.data ?? []) as Ev[], from, to)) {
    items.push({ key: `e:${o.key}`, kind: "evento", title: o.event.title, start: o.start.toISOString(), href: `/eventos/${o.event.id}`, category: o.event.category, priority: o.event.priority });
  }
  for (const t of (tasks.data ?? []) as { id: string; title: string; due_at: string; priority: string; category: string; status: string }[]) {
    items.push({ key: `t:${t.id}`, kind: "tarefa", title: t.status === "concluida" ? `✓ ${t.title}` : t.title, start: t.due_at, href: `/tarefas/${t.id}`, category: t.category, priority: t.priority });
  }
  for (const a of (exams.data ?? []) as { id: string; title: string; assessment_date: string }[]) {
    items.push({ key: `a:${a.id}`, kind: "prova", title: a.title, start: a.assessment_date, href: `/provas/${a.id}`, category: "prova" });
  }
  for (const p of (projects.data ?? []) as { id: string; name: string; due_date: string }[]) {
    items.push({ key: `p:${p.id}`, kind: "projeto", title: `Prazo: ${p.name}`, start: `${p.due_date}T12:00:00`, href: `/projetos/${p.id}`, category: "trabalho" });
  }
  for (const l of (league.data ?? []) as { id: string; title: string; starts_at: string }[]) {
    items.push({ key: `l:${l.id}`, kind: "liga", title: l.title, start: l.starts_at, href: `/liga-atividades/${l.id}`, category: "liga" });
  }
  return items.sort((a, b) => a.start.localeCompare(b.start));
}

export async function getDashboardData(workspaceId: string) {
  const supabase = await createClient();
  const now = new Date();
  const count = (table: string, f?: (q: ReturnType<typeof base>) => ReturnType<typeof base>) => {
    const q = base(table);
    return (f ? f(q) : q).then((r) => r.count ?? 0);
  };
  function base(table: string) {
    return supabase.from(table).select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId);
  }

  const [subjects, articles, cases, pathologies, pathologiesStudied, exercises, pendingTasks, activeProjects, notesCount, overdueTasks] = await Promise.all([
    count("subjects"),
    count("articles"),
    count("clinical_cases"),
    count("pathologies"),
    count("pathologies", (q) => q.eq("study_status", "estudado")),
    count("exercises"),
    count("tasks", (q) => q.in("status", ["pendente", "em_andamento"])),
    count("tasks", (q) => q.in("status", ["pendente", "em_andamento"]).lt("due_at", new Date().toISOString())),
    count("projects", (q) => q.in("status", ["em_andamento", "em_revisao"])),
    count("study_notes"),
  ]);

  const in30 = addDays(now, 30).toISOString();
  const [exams, examEvents, dueProjects, tasks, recentArticles, recentNotes, projects] = await Promise.all([
    supabase.from("assessments").select("id, title, assessment_date, subject_id").eq("workspace_id", workspaceId).eq("status", "agendada").gte("assessment_date", now.toISOString()).lte("assessment_date", in30).order("assessment_date").limit(6),
    supabase.from("events").select("id, title, start_at").eq("workspace_id", workspaceId).eq("category", "prova").gte("start_at", now.toISOString()).lte("start_at", in30).order("start_at").limit(6),
    supabase.from("projects").select("id, name, due_date, status").eq("workspace_id", workspaceId).neq("status", "concluido").not("due_date", "is", null).lte("due_date", format(addDays(now, 21), "yyyy-MM-dd")).order("due_date").limit(6),
    supabase.from("tasks").select("id, title, due_at, priority, status").eq("workspace_id", workspaceId).in("status", ["pendente", "em_andamento"]).order("due_at", { ascending: true, nullsFirst: false }).limit(8),
    supabase.from("articles").select("id, title, authors, year, reading_status").eq("workspace_id", workspaceId).order("created_at", { ascending: false }).limit(5),
    supabase.from("study_notes").select("id, title, topic, study_status, updated_at").eq("workspace_id", workspaceId).order("updated_at", { ascending: false }).limit(5),
    supabase.from("projects").select("id, name, due_date, status").eq("workspace_id", workspaceId).in("status", ["em_andamento", "em_revisao"]).order("due_date", { nullsFirst: false }).limit(5),
  ]);

  // Evolução semanal (últimas 8 semanas) a partir de registros reais
  const since = startOfWeek(subWeeks(now, 7), { weekStartsOn: 1 });
  const [reviews, attempts, notesW, articlesRead] = await Promise.all([
    supabase.from("flashcard_reviews").select("reviewed_at").eq("workspace_id", workspaceId).gte("reviewed_at", since.toISOString()).limit(10000),
    supabase.from("quiz_attempts").select("finished_at, score_percent").eq("workspace_id", workspaceId).gte("finished_at", since.toISOString()).limit(2000),
    supabase.from("study_notes").select("created_at").eq("workspace_id", workspaceId).gte("created_at", since.toISOString()).limit(5000),
    supabase.from("articles").select("read_date").eq("workspace_id", workspaceId).eq("reading_status", "lido").gte("read_date", format(since, "yyyy-MM-dd")).limit(5000),
  ]);
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const s = startOfWeek(subWeeks(now, 7 - i), { weekStartsOn: 1 });
    return { start: s, end: addDays(s, 7), label: format(s, "dd/MM"), revisoes: 0, simulados: 0, anotacoes: 0, artigos: 0 };
  });
  const bucket = (iso: string | null, key: "revisoes" | "simulados" | "anotacoes" | "artigos") => {
    if (!iso) return;
    const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
    const w = weeks.find((x) => d >= x.start && d < x.end);
    if (w) w[key]++;
  };
  for (const r of (reviews.data ?? []) as { reviewed_at: string }[]) bucket(r.reviewed_at, "revisoes");
  for (const r of (attempts.data ?? []) as { finished_at: string }[]) bucket(r.finished_at, "simulados");
  for (const r of (notesW.data ?? []) as { created_at: string }[]) bucket(r.created_at, "anotacoes");
  for (const r of (articlesRead.data ?? []) as { read_date: string }[]) bucket(r.read_date, "artigos");

  const week = await getAgenda(workspaceId, startOfDay(now), addDays(startOfDay(now), 7));

  return {
    stats: { subjects, articles, cases, pathologies, pathologiesStudied, exercises, pendingTasks, overdueTasks, activeProjects, notes: notesCount },
    exams: [
      ...((exams.data ?? []) as { id: string; title: string; assessment_date: string }[]).map((e) => ({ id: e.id, title: e.title, date: e.assessment_date, href: `/provas/${e.id}` })),
      ...((examEvents.data ?? []) as { id: string; title: string; start_at: string }[]).map((e) => ({ id: e.id, title: e.title, date: e.start_at, href: `/eventos/${e.id}` })),
    ].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 6),
    dueProjects: (dueProjects.data ?? []) as { id: string; name: string; due_date: string; status: string }[],
    tasks: (tasks.data ?? []) as { id: string; title: string; due_at: string | null; priority: string; status: string }[],
    recentArticles: (recentArticles.data ?? []) as { id: string; title: string; authors: string | null; year: number | null; reading_status: string }[],
    recentNotes: (recentNotes.data ?? []) as { id: string; title: string; topic: string | null; study_status: string; updated_at: string }[],
    projects: (projects.data ?? []) as { id: string; name: string; due_date: string | null; status: string }[],
    evolution: weeks.map(({ label, revisoes, simulados, anotacoes, artigos }) => ({ label, revisoes, simulados, anotacoes, artigos })),
    week,
  };
}
