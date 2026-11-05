import type { Metadata } from "next";
import Link from "next/link";
import { addDays, addMonths, addWeeks, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, parseISO, startOfDay, startOfMonth, startOfWeek, isValid } from "date-fns";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { requireSession } from "@/lib/session";
import { formatLong, formatTime } from "@/lib/utils/format";
import { getAgenda, type AgendaItem } from "@/modules/dashboard/queries";
import { AGENDA_CATEGORIES } from "@/modules/entities/definitions";
import { cn } from "@/lib/utils/cn";

export const metadata: Metadata = { title: "Agenda acadêmica" };

const CAT_STYLE: Record<string, string> = {
  aula: "border-l-chart-1",
  prova: "border-l-danger",
  trabalho: "border-l-chart-3",
  pesquisa: "border-l-chart-4",
  liga: "border-l-chart-2",
  estagio: "border-l-success",
  pessoal: "border-l-muted-foreground",
};

function Chip({ i, showTime = true }: { i: AgendaItem; showTime?: boolean }) {
  return (
    <Link href={i.href} title={i.title} className={cn("block truncate rounded border-l-[3px] bg-surface-muted px-1.5 py-0.5 text-[11px] leading-tight hover:bg-primary-soft", CAT_STYLE[i.category ?? ""] ?? "border-l-border")}>
      {showTime && <span className="tabular-nums text-muted-foreground">{formatTime(i.start)} </span>}
      {i.title}
    </Link>
  );
}

export default async function AgendaPage({ searchParams }: { searchParams: Promise<{ visao?: string; data?: string; categoria?: string }> }) {
  const ctx = await requireSession();
  const sp = await searchParams;
  const view = sp.visao === "semana" || sp.visao === "dia" ? sp.visao : (ctx.preferences?.calendar_prefs?.default_view === "week" ? "semana" : ctx.preferences?.calendar_prefs?.default_view === "day" ? "dia" : "mes");
  const parsed = sp.data ? parseISO(sp.data) : new Date();
  const ref = isValid(parsed) ? parsed : new Date();
  const wso = ctx.preferences?.calendar_prefs?.week_starts_on ?? 0;
  const cat = AGENDA_CATEGORIES.some((c) => c.value === sp.categoria) ? sp.categoria : undefined;

  let from: Date, to: Date, prev: Date, next: Date, title: string;
  if (view === "mes") {
    from = startOfWeek(startOfMonth(ref), { weekStartsOn: wso });
    to = endOfWeek(endOfMonth(ref), { weekStartsOn: wso });
    prev = addMonths(ref, -1);
    next = addMonths(ref, 1);
    title = formatLong(ref, "MMMM 'de' yyyy");
  } else if (view === "semana") {
    from = startOfWeek(ref, { weekStartsOn: wso });
    to = addDays(from, 7);
    prev = addWeeks(ref, -1);
    next = addWeeks(ref, 1);
    title = `Semana de ${format(from, "dd/MM/yyyy")}`;
  } else {
    from = startOfDay(ref);
    to = addDays(from, 1);
    prev = addDays(ref, -1);
    next = addDays(ref, 1);
    title = formatLong(ref, "EEEE, dd 'de' MMMM 'de' yyyy");
  }

  let items = await getAgenda(ctx.workspace.id, from, to);
  if (cat) items = items.filter((i) => i.category === cat);
  const href = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams({ visao: view, data: format(ref, "yyyy-MM-dd"), ...(cat ? { categoria: cat } : {}) });
    for (const [k, v] of Object.entries(patch)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    return `/agenda?${p.toString()}`;
  };
  const today = new Date();
  const days: Date[] = [];
  for (let d = from; d < to; d = addDays(d, 1)) days.push(d);
  const weekdayLabels = days.slice(0, 7).map((d) => formatLong(d, "EEE"));

  return (
    <div>
      <PageHeader
        title="Agenda acadêmica"
        description="Aulas, provas, trabalhos, prazos, reuniões, estágio e atividades da liga — com recorrência."
        icon="CalendarDays"
        actions={
          <>
            <Link href="/eventos/novo" className={buttonVariants()}><Plus /> Evento</Link>
            <Link href="/tarefas/novo" className={buttonVariants({ variant: "outline" })}><Plus /> Tarefa</Link>
          </>
        }
      />

      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          <Link href={href({ data: format(prev, "yyyy-MM-dd") })} className={buttonVariants({ variant: "outline", size: "icon" })} aria-label="Anterior"><ChevronLeft /></Link>
          <Link href={href({ data: format(new Date(), "yyyy-MM-dd") })} className={buttonVariants({ variant: "outline" })}>Hoje</Link>
          <Link href={href({ data: format(next, "yyyy-MM-dd") })} className={buttonVariants({ variant: "outline", size: "icon" })} aria-label="Próximo"><ChevronRight /></Link>
          <h2 className="ml-1 min-w-0 truncate text-sm font-semibold capitalize sm:ml-2 sm:text-base">{title}</h2>
        </div>
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap">
          <div className="inline-flex w-full rounded-lg bg-surface-muted p-1 sm:w-auto [&>a]:flex-1 [&>a]:text-center" role="tablist" aria-label="Visualização">
            {[["mes", "Mês"], ["semana", "Semana"], ["dia", "Dia"]].map(([v, l]) => (
              <Link key={v} role="tab" aria-selected={view === v} href={href({ visao: v })} className={cn("rounded-md px-3 py-1 text-sm font-medium text-muted-foreground", view === v && "bg-surface text-foreground shadow-card")}>{l}</Link>
            ))}
          </div>
          <div className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 scrollbar-thin sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&>a]:shrink-0">
            <Link href={href({ categoria: undefined })} className={cn("rounded-full border px-2.5 py-1 text-xs", !cat ? "border-primary bg-primary-soft text-primary" : "border-border")}>Todas</Link>
            {AGENDA_CATEGORIES.map((c) => (
              <Link key={c.value} href={href({ categoria: c.value })} className={cn("rounded-full border px-2.5 py-1 text-xs", cat === c.value ? "border-primary bg-primary-soft text-primary" : "border-border")}>{c.label}</Link>
            ))}
          </div>
        </div>
      </div>

      {view === "mes" && (
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          <div className="hidden grid-cols-7 border-b border-border bg-surface-muted/60 text-center text-xs font-medium capitalize text-muted-foreground sm:grid">
            {weekdayLabels.map((w) => <div key={w} className="py-2">{w}</div>)}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-7">
            {days.map((d) => {
              const list = items.filter((i) => isSameDay(new Date(i.start), d));
              const outside = !isSameMonth(d, ref);
              if (outside && list.length === 0) return <div key={d.toISOString()} className="hidden min-h-24 border-b border-r border-border bg-surface-muted/30 sm:block" />;
              return (
                <div key={d.toISOString()} className={cn("min-h-24 border-b border-border p-1.5 sm:border-r", outside && "bg-surface-muted/30", list.length === 0 && "hidden sm:block")}>
                  <Link href={href({ visao: "dia", data: format(d, "yyyy-MM-dd") })} className={cn("mb-1 inline-flex size-6 items-center justify-center rounded-full text-xs tabular-nums hover:bg-surface-muted", isSameDay(d, today) && "bg-primary text-primary-foreground hover:bg-primary")}>
                    {format(d, "d")}
                  </Link>
                  <span className="ml-1 text-xs capitalize text-muted-foreground sm:hidden">{formatLong(d, "EEEE")}</span>
                  <div className="space-y-0.5">
                    {list.slice(0, 4).map((i) => <Chip key={i.key} i={i} />)}
                    {list.length > 4 && <Link href={href({ visao: "dia", data: format(d, "yyyy-MM-dd") })} className="block px-1 text-[11px] text-primary">+{list.length - 4} mais</Link>}
                  </div>
                </div>
              );
            })}
          </div>
          {items.length === 0 && <p className="p-4 text-center text-sm text-muted-foreground sm:hidden">Nenhum compromisso neste mês.</p>}
        </div>
      )}

      {view === "semana" && (
        <div className="grid gap-2 md:grid-cols-7">
          {days.map((d) => {
            const list = items.filter((i) => isSameDay(new Date(i.start), d));
            return (
              <section key={d.toISOString()} className={cn("min-h-40 rounded-lg border border-border bg-surface p-2", isSameDay(d, today) && "border-primary")}>
                <Link href={href({ visao: "dia", data: format(d, "yyyy-MM-dd") })} className="mb-2 block text-xs font-semibold capitalize text-muted-foreground hover:text-foreground">{formatLong(d, "EEE dd/MM")}</Link>
                <div className="space-y-1">{list.map((i) => <Chip key={i.key} i={i} />)}</div>
              </section>
            );
          })}
        </div>
      )}

      {view === "dia" && (
        <div className="rounded-lg border border-border bg-surface">
          {items.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">Nenhum compromisso neste dia.</p>
          ) : (
            <ul className="divide-y divide-border">
              {items.map((i) => (
                <li key={i.key} className="flex items-center gap-4 px-4 py-3">
                  <span className="w-12 text-sm tabular-nums text-muted-foreground">{formatTime(i.start)}</span>
                  <div className="min-w-0 flex-1"><Chip i={i} showTime={false} /></div>
                  <span className="text-xs capitalize text-muted-foreground">{i.kind}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
