import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { publicAiStatus } from "@/lib/ai/config";
import { formatRelative } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import { AssistantChat, type ChatMessage } from "@/modules/assistant/chat";
import { TOPICS } from "@/modules/assistant/topics";
import { describeContextAction } from "@/modules/assistant/actions";

export const metadata: Metadata = { title: "Assistente acadêmico" };

export default async function AssistantPage({ searchParams }: { searchParams: Promise<{ c?: string; q?: string; assunto?: string; contexto?: string }> }) {
  const ctx = await requireSession();
  const sp = await searchParams;
  const supabase = await createClient();
  const ai = publicAiStatus();

  let convQuery = supabase.from("ai_conversations").select("id, title, topic, context_type, updated_at").eq("workspace_id", ctx.workspace.id).eq("created_by", ctx.user.id).order("updated_at", { ascending: false }).limit(100);
  if (sp.assunto && TOPICS.includes(sp.assunto)) convQuery = convQuery.eq("topic", sp.assunto);
  if (sp.q && sp.q.trim().length >= 2) {
    const term = sp.q.slice(0, 100).replace(/[%_,()]/g, "");
    const { data: msgHits } = await supabase.from("ai_messages").select("conversation_id").ilike("content", `%${term}%`).limit(200);
    const ids = Array.from(new Set(((msgHits ?? []) as { conversation_id: string }[]).map((m) => m.conversation_id)));
    convQuery = convQuery.or(`title.ilike.%${term}%${ids.length ? `,id.in.(${ids.join(",")})` : ""}`);
  }
  const { data: convs } = await convQuery;
  const conversations = (convs ?? []) as { id: string; title: string; topic: string | null; context_type: string | null; updated_at: string }[];

  const selected = sp.c && /^[0-9a-f-]{36}$/i.test(sp.c) ? conversations.find((c) => c.id === sp.c) ?? (await supabase.from("ai_conversations").select("id, title, topic, context_type, updated_at").eq("id", sp.c).maybeSingle()).data : null;
  const { data: msgs } = selected ? await supabase.from("ai_messages").select("id, role, content, citations, created_at").eq("conversation_id", selected.id).order("created_at") : { data: [] };
  const context = !selected && sp.contexto ? await describeContextAction(sp.contexto) : null;
  const ctxInfo = context && context.ok && context.data ? { ref: `${context.data.type}:${context.data.id}`, title: context.data.title, label: context.data.label } : null;

  return (
    <div>
      <PageHeader title="Assistente acadêmico" description={ai.chatConfigured ? `IA integrada aos seus materiais · ${ai.chatProvider}${ai.embeddingModel ? " · busca semântica ativa" : " · busca textual"}` : "IA integrada aos seus materiais"} icon="Sparkles"
        actions={<Link href="/assistente" className={buttonVariants()}><Plus /> Nova conversa</Link>} />
      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="order-2 space-y-3 lg:order-none">
          <form action="/assistente" className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input name="q" defaultValue={sp.q ?? ""} placeholder="Pesquisar conversas…" className="h-9 w-full rounded-md border border-input bg-surface pl-9 pr-3 text-sm" aria-label="Pesquisar conversas" />
          </form>
          <div className="flex flex-wrap gap-1 text-xs">
            <Link href="/assistente" className={cn("rounded-full border px-2 py-0.5", !sp.assunto ? "border-primary text-primary" : "border-border")}>Todas</Link>
            {TOPICS.map((t) => <Link key={t} href={`/assistente?assunto=${encodeURIComponent(t)}`} className={cn("rounded-full border px-2 py-0.5", sp.assunto === t ? "border-primary text-primary" : "border-border")}>{t}</Link>)}
          </div>
          <nav aria-label="Histórico de conversas" className="max-h-[60vh] overflow-y-auto rounded-lg border border-border bg-surface">
            {conversations.length === 0 ? <p className="p-3 text-sm text-muted-foreground">Nenhuma conversa.</p> : (
              <ul className="divide-y divide-border">
                {conversations.map((c) => (
                  <li key={c.id}>
                    <Link href={`/assistente?c=${c.id}`} className={cn("block px-3 py-2 hover:bg-surface-muted", selected?.id === c.id && "bg-primary-soft")}>
                      <span className="block truncate text-sm font-medium">{c.title}</span>
                      <span className="text-xs text-muted-foreground">{c.topic ? `${c.topic} · ` : ""}{c.context_type ? "com contexto · " : ""}{formatRelative(c.updated_at)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </nav>
        </aside>
        <AssistantChat
          key={selected?.id ?? `new-${ctxInfo?.ref ?? ""}`}
          conversationId={selected?.id ?? null}
          conversationTopic={selected?.topic ?? null}
          initialMessages={(msgs ?? []) as ChatMessage[]}
          context={ctxInfo}
          aiConfigured={ai.chatConfigured}
          configMessage="Defina AI_CHAT_PROVIDER, AI_CHAT_MODEL e a chave do provedor (ANTHROPIC_API_KEY ou OPENAI_API_KEY) nas variáveis de ambiente do servidor. A interface permanece disponível, mas nenhuma resposta é simulada."
        />
      </div>
    </div>
  );
}
