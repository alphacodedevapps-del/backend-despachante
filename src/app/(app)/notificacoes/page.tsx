import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { formatRelative } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import { DeleteNotificationButton, MarkReadButton } from "@/modules/notifications/buttons";

export const metadata: Metadata = { title: "Notificações" };

const TYPE_LABEL: Record<string, string> = { prazo: "Prazo", prova: "Prova", tarefa_atrasada: "Atrasada", convite: "Convite", liga: "Liga", projeto: "Projeto", revisao: "Revisão", meta: "Meta", sistema: "Sistema" };

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ filtro?: string }> }) {
  const ctx = await requireSession();
  const sp = await searchParams;
  const supabase = await createClient();
  let q = supabase.from("notifications").select("id, type, title, body, link, read_at, created_at").eq("user_id", ctx.user.id).order("created_at", { ascending: false }).limit(200);
  if (sp.filtro === "nao-lidas") q = q.is("read_at", null);
  const { data } = await q;
  const list = (data ?? []) as { id: string; type: string; title: string; body: string | null; link: string | null; read_at: string | null; created_at: string }[];
  return (
    <div className="space-y-4">
      <PageHeader title="Notificações" description="Prazos, provas, tarefas atrasadas, convites, liga, projetos, revisões e metas." icon="Bell"
        actions={<><Link href="/configuracoes#notificacoes" className={buttonVariants({ variant: "ghost" })}>Preferências</Link><MarkReadButton id={null} /></>} />
      <div className="flex gap-2 text-sm">
        <Link href="/notificacoes" className={cn("rounded-full border px-3 py-1", !sp.filtro ? "border-primary bg-primary-soft text-primary" : "border-border")}>Todas</Link>
        <Link href="/notificacoes?filtro=nao-lidas" className={cn("rounded-full border px-3 py-1", sp.filtro === "nao-lidas" ? "border-primary bg-primary-soft text-primary" : "border-border")}>Não lidas</Link>
      </div>
      {list.length === 0 ? <EmptyState icon="Bell" title="Nenhuma notificação" description="Você será avisado sobre prazos, provas e convites." /> : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
          {list.map((n) => (
            <li key={n.id} className={cn("flex items-start gap-3 p-3", !n.read_at && "bg-primary-soft/30")}>
              <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.read_at ? "bg-transparent" : "bg-primary")} aria-label={n.read_at ? "Lida" : "Não lida"} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2"><Badge>{TYPE_LABEL[n.type] ?? n.type}</Badge><span className="text-xs text-muted-foreground">{formatRelative(n.created_at)}</span></div>
                {n.link ? <Link href={n.link} className="mt-1 block text-sm font-medium hover:text-primary">{n.title}</Link> : <p className="mt-1 text-sm font-medium">{n.title}</p>}
                {n.body && <p className="text-sm text-muted-foreground">{n.body}</p>}
              </div>
              {!n.read_at && <MarkReadButton id={n.id} />}
              <DeleteNotificationButton id={n.id} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
