"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarClock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import { patchRecordAction } from "@/modules/entities/actions";
import { PROJECT_STATUS } from "@/modules/entities/definitions";

export interface KanbanCard {
  id: string;
  name: string;
  status: string;
  typeLabel: string;
  due_date: string | null;
  progress: number | null;
  editable: boolean;
}

export function KanbanBoard({ cards: initial }: { cards: KanbanCard[] }) {
  const router = useRouter();
  const [cards, setCards] = React.useState(initial);
  const [dragId, setDragId] = React.useState<string | null>(null);
  const [over, setOver] = React.useState<string | null>(null);
  React.useEffect(() => setCards(initial), [initial]);

  const move = async (id: string, status: string) => {
    const card = cards.find((c) => c.id === id);
    if (!card || card.status === status) return;
    if (!card.editable) return void toast.error("Você não pode alterar este projeto.");
    const prev = cards;
    setCards(cards.map((c) => (c.id === id ? { ...c, status } : c)));
    const res = await patchRecordAction("projects", id, { status });
    if (!res.ok) {
      setCards(prev);
      toast.error(res.error);
    } else router.refresh();
  };

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="mb-6 grid gap-3 overflow-x-auto pb-2 md:grid-cols-4">
      {PROJECT_STATUS.map((col) => {
        const list = cards.filter((c) => c.status === col.value);
        return (
          <section
            key={col.value}
            aria-label={col.label}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(col.value);
            }}
            onDragLeave={() => setOver(null)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(null);
              if (dragId) void move(dragId, col.value);
            }}
            className={cn("min-h-40 rounded-lg border border-border bg-surface-muted/50 p-2 transition-colors", over === col.value && "border-primary bg-primary-soft/40")}
          >
            <h3 className="mb-2 flex items-center justify-between px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {col.label} <span className="tabular-nums">{list.length}</span>
            </h3>
            <ul className="space-y-2">
              {list.map((c) => (
                <li
                  key={c.id}
                  draggable={c.editable}
                  onDragStart={() => setDragId(c.id)}
                  onDragEnd={() => setDragId(null)}
                  className={cn("rounded-md border border-border bg-surface p-3 shadow-card", c.editable && "cursor-grab active:cursor-grabbing", dragId === c.id && "opacity-50")}
                >
                  <Link href={`/projetos/${c.id}`} className="block text-sm font-medium leading-snug hover:text-primary">{c.name}</Link>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <Badge>{c.typeLabel}</Badge>
                    {c.due_date && (
                      <Badge tone={c.status !== "concluido" && c.due_date < today ? "danger" : "neutral"}>
                        <CalendarClock className="size-3" /> {formatDate(c.due_date)}
                      </Badge>
                    )}
                    {c.progress !== null && <Badge tone="primary">{c.progress}%</Badge>}
                  </div>
                  {c.editable && (
                    <label className="mt-2 block md:hidden">
                      <span className="sr-only">Mover para</span>
                      <select className="h-8 w-full rounded-md border border-input bg-surface px-2 text-xs" value={c.status} onChange={(e) => move(c.id, e.target.value)}>
                        {PROJECT_STATUS.map((s) => (
                          <option key={s.value} value={s.value}>{s.label}</option>
                        ))}
                      </select>
                    </label>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
