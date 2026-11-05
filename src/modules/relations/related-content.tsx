"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Link2, Loader2, Plus, Search, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Input, NativeSelect } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/shared/icon";
import { entityHref, entityTypeIcon, entityTypeLabel, SEARCHABLE_TYPES } from "@/modules/entities/links";
import { addLinkAction, removeLinkAction, searchLinkTargetsAction, type SearchHit } from "./actions";
import type { LinkedItem } from "./queries";

export function RelatedContent({ type, id, items, canEdit, suggest, aiAvailable }: {
  type: string;
  id: string;
  items: LinkedItem[];
  canEdit: boolean;
  suggest?: (type: string, id: string) => Promise<{ ok: true; data: SearchHit[] } | { ok: false; error: string }>;
  aiAvailable?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [filter, setFilter] = React.useState("");
  const [removing, setRemoving] = React.useState<string | null>(null);

  const grouped = React.useMemo(() => {
    const map = new Map<string, LinkedItem[]>();
    for (const it of items) {
      if (filter && !`${it.title} ${it.subtitle ?? ""}`.toLowerCase().includes(filter.toLowerCase())) continue;
      if (!map.has(it.type)) map.set(it.type, []);
      map.get(it.type)!.push(it);
    }
    return Array.from(map.entries()).sort((a, b) => entityTypeLabel(a[0]).localeCompare(entityTypeLabel(b[0]), "pt-BR"));
  }, [items, filter]);

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="size-4 text-primary" /> Conteúdos relacionados
          </CardTitle>
          <CardDescription>Relacione patologias, artigos, testes, exercícios, casos, disciplinas e arquivos.</CardDescription>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            {suggest && <SuggestDialog type={type} id={id} suggest={suggest} aiAvailable={aiAvailable} />}
            <AddLinkDialog type={type} id={id} existing={items} />
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {items.length > 6 && (
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filtrar relacionados…" className="pl-9" />
          </div>
        )}
        {items.length === 0 && <p className="text-sm text-muted-foreground">Nenhum conteúdo relacionado ainda.</p>}
        {grouped.map(([t, list]) => (
          <div key={t}>
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <Icon name={entityTypeIcon(t)} className="size-3.5" /> {entityTypeLabel(t)} ({list.length})
            </p>
            <ul className="divide-y divide-border rounded-md border border-border">
              {list.map((it) => (
                <li key={it.link_id} className="flex items-center justify-between gap-2 px-3 py-2">
                  <Link href={entityHref(it.type, it.id)} className="min-w-0 flex-1 hover:text-primary">
                    <span className="block truncate text-sm font-medium">{it.title}</span>
                    {it.subtitle && <span className="block truncate text-xs text-muted-foreground">{it.subtitle}</span>}
                  </Link>
                  {it.relation === "sugerido_ia" && <Badge tone="info">IA (aprovado)</Badge>}
                  {it.relation === "anexo" && <Badge>Anexo</Badge>}
                  {canEdit && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Remover relação com ${it.title}`}
                      disabled={removing === it.link_id}
                      onClick={async () => {
                        setRemoving(it.link_id);
                        const res = await removeLinkAction(it.link_id, pathname);
                        setRemoving(null);
                        if (!res.ok) toast.error(res.error);
                        else {
                          toast.success("Relação removida.");
                          router.refresh();
                        }
                      }}
                    >
                      {removing === it.link_id ? <Loader2 className="animate-spin" /> : <X />}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function AddLinkDialog({ type, id, existing }: { type: string; id: string; existing: LinkedItem[] }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [t, setT] = React.useState("");
  const [hits, setHits] = React.useState<SearchHit[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [adding, setAdding] = React.useState<string | null>(null);
  const linked = new Set(existing.map((e) => `${e.type}:${e.id}`));

  React.useEffect(() => {
    if (!open) return;
    if (q.trim().length < 2) return;
    const handle = setTimeout(async () => {
      setLoading(true);
      const res = await searchLinkTargetsAction(q, t ? [t] : null);
      setLoading(false);
      if (res.ok) setHits(res.data.filter((h) => !(h.type === type && h.id === id)));
      else toast.error(res.error);
    }, 250);
    return () => clearTimeout(handle);
  }, [q, t, open, type, id]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus /> Relacionar
        </Button>
      </DialogTrigger>
      <DialogContent title="Adicionar relação" description="Pesquise registros do workspace atual para relacionar." wide>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Digite ao menos 2 letras…" aria-label="Pesquisar registros" />
          <NativeSelect value={t} onChange={(e) => setT(e.target.value)} className="sm:w-56" aria-label="Tipo">
            <option value="">Todos os tipos</option>
            {SEARCHABLE_TYPES.map((s) => (
              <option key={s.type} value={s.type}>{s.label}</option>
            ))}
          </NativeSelect>
        </div>
        <div className="mt-3 max-h-[50vh] overflow-y-auto">
          {loading && <p className="flex items-center gap-2 p-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Pesquisando…</p>}
          {!loading && q.trim().length >= 2 && hits.length === 0 && <p className="p-2 text-sm text-muted-foreground">Nenhum resultado.</p>}
          <ul className="divide-y divide-border">
            {(q.trim().length < 2 ? [] : hits).map((h) => {
              const key = `${h.type}:${h.id}`;
              const already = linked.has(key);
              return (
                <li key={key} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{h.title}</p>
                    <p className="truncate text-xs text-muted-foreground">{entityTypeLabel(h.type)}{h.subtitle ? ` · ${h.subtitle}` : ""}</p>
                  </div>
                  <Button
                    size="sm"
                    variant={already ? "ghost" : "secondary"}
                    disabled={already || adding === key}
                    onClick={async () => {
                      setAdding(key);
                      const res = await addLinkAction(type, id, h.type, h.id);
                      setAdding(null);
                      if (!res.ok) toast.error(res.error);
                      else {
                        toast.success("Relação adicionada.");
                        router.refresh();
                      }
                    }}
                  >
                    {adding === key ? <Loader2 className="animate-spin" /> : already ? "Relacionado" : "Relacionar"}
                  </Button>
                </li>
              );
            })}
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SuggestDialog({ type, id, suggest, aiAvailable }: {
  type: string;
  id: string;
  suggest: (type: string, id: string) => Promise<{ ok: true; data: SearchHit[] } | { ok: false; error: string }>;
  aiAvailable?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [hits, setHits] = React.useState<SearchHit[] | null>(null);
  const [done, setDone] = React.useState<Set<string>>(new Set());

  const run = async () => {
    setLoading(true);
    setError(null);
    const res = await suggest(type, id);
    setLoading(false);
    if (!res.ok) setError(res.error);
    else setHits(res.data);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o && hits === null && aiAvailable) void run();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Sparkles /> Sugerir com IA
        </Button>
      </DialogTrigger>
      <DialogContent title="Sugestões de relacionamento" description="A IA sugere; você decide. Nada é relacionado sem sua aprovação." wide>
        {!aiAvailable && <p className="text-sm text-muted-foreground">A integração de IA não está configurada neste ambiente. Configure as variáveis de IA no servidor (veja AI_INTEGRATION.md).</p>}
        {loading && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Analisando conteúdos do workspace…</p>}
        {error && <p className="text-sm text-danger">{error}</p>}
        {hits && hits.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma sugestão encontrada.</p>}
        <ul className="divide-y divide-border">
          {(hits ?? []).map((h) => {
            const key = `${h.type}:${h.id}`;
            return (
              <li key={key} className="flex items-start justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{h.title}</p>
                  <p className="text-xs text-muted-foreground">{entityTypeLabel(h.type)}</p>
                  {h.snippet && <p className="mt-1 text-xs text-muted-foreground">{h.snippet}</p>}
                </div>
                <Button
                  size="sm"
                  disabled={done.has(key)}
                  onClick={async () => {
                    const res = await addLinkAction(type, id, h.type, h.id, "sugerido_ia");
                    if (!res.ok) toast.error(res.error);
                    else {
                      setDone(new Set(done).add(key));
                      toast.success("Relação aprovada.");
                      router.refresh();
                    }
                  }}
                >
                  {done.has(key) ? "Aprovado" : "Aprovar"}
                </Button>
              </li>
            );
          })}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
