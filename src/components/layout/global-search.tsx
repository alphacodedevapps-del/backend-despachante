"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Dialog as D } from "radix-ui";
import { Loader2, Search } from "lucide-react";
import { Icon } from "@/components/shared/icon";
import { entityHref, entityTypeIcon, entityTypeLabel, SEARCHABLE_TYPES } from "@/modules/entities/links";
import { globalSearchAction, type GlobalSearchHit } from "@/modules/shell/actions";
import { cn } from "@/lib/utils/cn";

export function useGroupedHits(hits: GlobalSearchHit[]) {
  return React.useMemo(() => {
    const map = new Map<string, GlobalSearchHit[]>();
    for (const h of hits) {
      if (!map.has(h.type)) map.set(h.type, []);
      map.get(h.type)!.push(h);
    }
    return Array.from(map.entries());
  }, [hits]);
}

export function GlobalSearch({ workspaceNames }: { workspaceNames: Record<string, string> }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [all, setAll] = React.useState(false);
  const [type, setType] = React.useState("");
  const [hits, setHits] = React.useState<GlobalSearchHit[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [active, setActive] = React.useState(0);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  React.useEffect(() => {
    if (!open) return;
    if (q.trim().length < 2) return;
    const t = setTimeout(async () => {
      setLoading(true);
      const res = await globalSearchAction(q, all, type ? [type] : null);
      setLoading(false);
      if (res.ok) {
        setHits(res.data);
        setError(null);
        setActive(0);
      } else setError(res.error);
    }, 200);
    return () => clearTimeout(t);
  }, [q, all, type, open]);

  const shown = q.trim().length < 2 ? [] : hits;
  const grouped = useGroupedHits(shown);
  const flat = grouped.flatMap(([, list]) => list);

  const go = (h: GlobalSearchHit) => {
    setOpen(false);
    router.push(entityHref(h.type, h.id));
  };

  return (
    <D.Root open={open} onOpenChange={setOpen}>
      <D.Trigger asChild>
        <button
          type="button"
          className="flex h-9 w-full max-w-md items-center gap-2 rounded-md border border-border bg-surface px-3 text-sm text-muted-foreground hover:bg-surface-muted cursor-pointer"
          aria-label="Busca global"
        >
          <Search className="size-4" />
          <span className="flex-1 truncate text-left">Buscar em tudo…</span>
          <kbd className="hidden rounded border border-border px-1.5 text-[10px] font-medium sm:inline">Ctrl K</kbd>
        </button>
      </D.Trigger>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-black/40 animate-fade-in" />
        <D.Content className="fixed left-1/2 top-[8vh] z-50 w-[calc(100vw-1.5rem)] max-w-2xl -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-surface shadow-pop animate-slide-up">
          <D.Title className="sr-only">Busca global</D.Title>
          <D.Description className="sr-only">Pesquise disciplinas, artigos, patologias, exercícios, testes, anotações e mais.</D.Description>
          <div className="flex items-center gap-2 border-b border-border px-3">
            <Search className="size-4 text-muted-foreground" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActive((a) => Math.min(a + 1, flat.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActive((a) => Math.max(a - 1, 0));
                } else if (e.key === "Enter" && flat[active]) {
                  e.preventDefault();
                  go(flat[active]);
                }
              }}
              placeholder="Pesquisar disciplinas, artigos, patologias, exercícios, testes…"
              className="h-12 flex-1 bg-transparent text-sm outline-none"
              aria-label="Termo de busca"
            />
            {loading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
          </div>
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2 text-xs">
            <select value={type} onChange={(e) => setType(e.target.value)} className="h-7 rounded-md border border-input bg-surface px-2" aria-label="Filtrar por categoria">
              <option value="">Todas as categorias</option>
              {SEARCHABLE_TYPES.map((s) => (
                <option key={s.type} value={s.type}>{s.label}</option>
              ))}
            </select>
            <label className="flex items-center gap-1.5 text-muted-foreground">
              <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} className="accent-[var(--primary)]" />
              Todos os meus workspaces
            </label>
          </div>
          <div className="max-h-[60vh] overflow-y-auto p-2">
            {error && <p className="p-3 text-sm text-danger">{error}</p>}
            {!loading && q.trim().length >= 2 && shown.length === 0 && !error && <p className="p-3 text-sm text-muted-foreground">Nenhum resultado para “{q}”.</p>}
            {q.trim().length < 2 && <p className="p-3 text-sm text-muted-foreground">Digite pelo menos 2 caracteres. Acentos são ignorados.</p>}
            {grouped.map(([t, list]) => (
              <div key={t} className="mb-2">
                <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{entityTypeLabel(t)}</p>
                {list.map((h) => {
                  const idx = flat.indexOf(h);
                  return (
                    <button
                      key={`${h.type}:${h.id}`}
                      type="button"
                      onMouseEnter={() => setActive(idx)}
                      onClick={() => go(h)}
                      className={cn("flex w-full items-start gap-3 rounded-md px-2 py-2 text-left cursor-pointer", idx === active && "bg-surface-muted")}
                    >
                      <Icon name={entityTypeIcon(h.type)} className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{h.title}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {[h.subtitle, all ? workspaceNames[h.workspace_id] : null].filter(Boolean).join(" · ") || h.snippet}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
