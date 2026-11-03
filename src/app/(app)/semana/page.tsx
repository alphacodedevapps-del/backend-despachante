import type { Metadata } from "next";
import Link from "next/link";
import { addDays, addWeeks, format, isSameDay, startOfWeek } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/shared/page-header";
import { requireSession } from "@/lib/session";
import { formatLong, formatTime, formatDate } from "@/lib/utils/format";
import { getAgenda } from "@/modules/dashboard/queries";
import { cn } from "@/lib/utils/cn";

export const metadata: Metadata = { title: "Minha semana" };

export default async function WeekPage({ searchParams }: { searchParams: Promise<{ semana?: string }> }) {
  const ctx = await requireSession();
  const sp = await searchParams;
  const offset = Math.max(-52, Math.min(52, Number(sp.semana ?? 0) || 0));
  const weekStartsOn = ctx.preferences?.calendar_prefs?.week_starts_on ?? 0;
  const start = startOfWeek(addWeeks(new Date(), offset), { weekStartsOn });
  const end = addDays(start, 7);
  const items = await getAgenda(ctx.workspace.id, start, end);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const today = new Date();

  return (
    <div>
      <PageHeader
        title="Minha semana"
        description={`${formatDate(start)} a ${formatDate(addDays(start, 6))}`}
        icon="CalendarCheck"
        actions={
          <>
            <Link href={`/semana?semana=${offset - 1}`} className={buttonVariants({ variant: "outline", size: "icon" })} aria-label="Semana anterior"><ChevronLeft /></Link>
            <Link href="/semana" className={buttonVariants({ variant: "outline" })}>Hoje</Link>
            <Link href={`/semana?semana=${offset + 1}`} className={buttonVariants({ variant: "outline", size: "icon" })} aria-label="Próxima semana"><ChevronRight /></Link>
            <Link href="/eventos/novo" className={buttonVariants()}>Novo evento</Link>
          </>
        }
      />
      <div className="grid gap-3 md:grid-cols-7">
        {days.map((day) => {
          const list = items.filter((i) => isSameDay(new Date(i.start), day));
          return (
            <section key={day.toISOString()} className={cn("min-h-32 rounded-lg border border-border bg-surface p-2", isSameDay(day, today) && "border-primary ring-1 ring-primary/30")}>
              <h2 className="mb-2 px-1 text-xs font-semibold capitalize text-muted-foreground">{formatLong(day, "EEE, dd/MM")}</h2>
              {list.length === 0 ? (
                <p className="px-1 text-xs text-muted-foreground/70">—</p>
              ) : (
                <ul className="space-y-1.5">
                  {list.map((i) => (
                    <li key={i.key}>
                      <Link href={i.href} className="block rounded-md bg-surface-muted px-2 py-1.5 text-xs hover:bg-primary-soft">
                        <span className="tabular-nums text-muted-foreground">{formatTime(i.start)}</span> <span className="font-medium">{i.title}</span>
                        <Badge className="mt-1 block w-fit" tone={i.kind === "prova" ? "warning" : i.kind === "tarefa" ? "info" : "neutral"}>{i.category ?? i.kind}</Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">Semana exibida a partir de {format(start, "dd/MM/yyyy")}. Altere o primeiro dia da semana em Configurações.</p>
    </div>
  );
}
