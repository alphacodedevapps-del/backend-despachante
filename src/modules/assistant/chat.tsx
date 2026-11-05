"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, Loader2, Send, Sparkles, Square, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea, NativeSelect } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils/cn";
import { deleteConversationAction, updateConversationAction } from "./actions";
import { TOPICS } from "./topics";
import type { Citation } from "./context";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations: Citation[];
  created_at: string;
}

const SUGGESTIONS = [
  "Resuma meus artigos sobre joelho.",
  "Quais materiais tenho sobre manguito rotador?",
  "Compare os estudos que salvei sobre LCA.",
  "Crie um simulado de neurofuncional.",
  "Explique a diferença entre tendinopatia e bursite do ombro.",
  "Encontre assuntos que ainda não revisei.",
  "Crie flashcards utilizando minha anotação mais recente.",
  "Organize um plano de estudos para minha próxima prova.",
];


/** Renderização simples e segura (sem HTML) com destaque para citações [n]. */
function RichText({ text, citations }: { text: string; citations: Citation[] }) {
  const byN = new Map(citations.map((c) => [c.n, c]));
  return (
    <div className="prose-content text-sm">
      {text.split(/\n{2,}/).map((para, i) => (
        <p key={i} className="whitespace-pre-wrap">
          {para.split(/(\[\d{1,2}\]|\*\*[^*]+\*\*)/g).map((part, j) => {
            const m = /^\[(\d{1,2})\]$/.exec(part);
            if (m) {
              const c = byN.get(Number(m[1]));
              return c ? <Link key={j} href={c.href} title={c.title} className="mx-0.5 inline-flex rounded bg-primary-soft px-1 text-[11px] font-semibold text-primary no-underline">{m[1]}</Link> : <span key={j}>{part}</span>;
            }
            if (/^\*\*[^*]+\*\*$/.test(part)) return <strong key={j}>{part.slice(2, -2)}</strong>;
            return <React.Fragment key={j}>{part}</React.Fragment>;
          })}
        </p>
      ))}
    </div>
  );
}

export function AssistantChat({ conversationId, conversationTopic, initialMessages, context, aiConfigured, configMessage }: {
  conversationId: string | null;
  conversationTopic: string | null;
  initialMessages: ChatMessage[];
  context: { ref: string; title: string; label: string } | null;
  aiConfigured: boolean;
  configMessage: string;
}) {
  const router = useRouter();
  const [messages, setMessages] = React.useState(initialMessages);
  const [convId, setConvId] = React.useState(conversationId);
  const [input, setInput] = React.useState("");
  const [topic, setTopic] = React.useState(conversationTopic ?? "");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);
  const endRef = React.useRef<HTMLDivElement>(null);
  const seq = React.useRef(0);

  React.useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, pending]);

  const send = async (text: string) => {
    const msg = text.trim();
    if (!msg || pending) return;
    setError(null);
    setPending(true);
    setInput("");
    const optimistic: ChatMessage = { id: `tmp-${++seq.current}`, role: "user", content: msg, citations: [], created_at: "" };
    setMessages((m) => [...m, optimistic]);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const res = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: convId, message: msg, context: convId ? null : context?.ref ?? null, topic: topic || null }),
        signal: ctrl.signal,
      });
      const json = await res.json().catch(() => ({}));
      if (json.conversationId && json.conversationId !== convId) {
        setConvId(json.conversationId);
        window.history.replaceState(null, "", `/assistente?c=${json.conversationId}`);
      }
      if (!res.ok) {
        setError(json.error ?? "Falha ao consultar a IA.");
      } else if (json.message) {
        setMessages((m) => [...m, json.message as ChatMessage]);
      }
      router.refresh();
    } catch (e) {
      if ((e as Error).name === "AbortError") setError("Solicitação cancelada.");
      else setError("Erro de rede ao consultar a IA.");
    } finally {
      setPending(false);
      abortRef.current = null;
    }
  };

  return (
    <div className="flex min-h-[70vh] flex-col rounded-lg border border-border bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2">
        <div className="flex min-w-0 items-center gap-2">
          {context && !convId && <Badge tone="primary">Contexto: {context.label} — {context.title}</Badge>}
          {!context && !convId && <span className="text-xs text-muted-foreground">Consulta todo o workspace atual (somente conteúdos autorizados).</span>}
        </div>
        <div className="flex items-center gap-2">
          <NativeSelect aria-label="Assunto da conversa" value={topic} className="h-8 w-44 text-xs" onChange={async (e) => {
            setTopic(e.target.value);
            if (convId) { const r = await updateConversationAction(convId, { topic: e.target.value || null }); if (!r.ok) toast.error(r.error); else router.refresh(); }
          }}>
            <option value="">Sem assunto</option>
            {TOPICS.map((t) => <option key={t}>{t}</option>)}
          </NativeSelect>
          {convId && (
            <Button variant="ghost" size="icon-sm" aria-label="Excluir conversa" onClick={async () => {
              if (!confirm("Excluir esta conversa?")) return;
              const r = await deleteConversationAction(convId);
              if (!r.ok) return void toast.error(r.error);
              toast.success("Conversa excluída.");
              router.push("/assistente");
              router.refresh();
            }}><Trash2 /></Button>
          )}
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4" aria-live="polite">
        {!aiConfigured && <Alert tone="warning" title="Integração de IA não configurada">{configMessage}</Alert>}
        {messages.length === 0 && (
          <div className="mx-auto max-w-xl py-6 text-center">
            <Sparkles className="mx-auto mb-2 size-8 text-primary" />
            <p className="font-medium">Como posso ajudar nos seus estudos?</p>
            <p className="mt-1 text-sm text-muted-foreground">Respondo com base nos seus materiais e cito as fontes utilizadas.</p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" disabled={!aiConfigured || pending} onClick={() => send(s)} className="rounded-lg border border-border p-2.5 text-left text-sm hover:border-primary/40 hover:bg-surface-muted disabled:opacity-50 cursor-pointer">{s}</button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
            <div className={cn("max-w-[92%] rounded-xl px-4 py-3 sm:max-w-[80%]", m.role === "user" ? "bg-primary text-primary-foreground" : "border border-border bg-background")}>
              {m.role === "user" ? <p className="whitespace-pre-wrap text-sm">{m.content}</p> : <RichText text={m.content} citations={m.citations} />}
              {m.role === "assistant" && (
                <div className="mt-3 space-y-2 border-t border-border pt-2">
                  {m.citations.length > 0 && (
                    <div>
                      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Fontes utilizadas</p>
                      <ol className="space-y-1">
                        {m.citations.map((c) => (
                          <li key={c.n} className="text-xs">
                            <Link href={c.href} className="font-medium text-primary hover:underline">[{c.n}] {c.title}</Link>
                            {c.page ? <span className="text-muted-foreground"> · p. {c.page}</span> : null}
                            {c.excerpt && <span className="block truncate text-muted-foreground">{c.excerpt}</span>}
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                  {m.citations.length === 0 && <p className="text-[11px] text-muted-foreground">Nenhuma fonte dos seus materiais foi utilizada nesta resposta.</p>}
                  <Button variant="ghost" size="sm" onClick={async () => { await navigator.clipboard.writeText(m.content); toast.success("Resposta copiada."); }}><Copy /> Copiar</Button>
                </div>
              )}
            </div>
          </div>
        ))}
        {pending && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Consultando seus materiais e gerando a resposta…</div>
        )}
        {error && (
          <Alert tone="danger" title="Não foi possível responder"><span>{error}</span> <button className="ml-2 underline" onClick={() => setError(null)}><X className="inline size-3" /> fechar</button></Alert>
        )}
        <div ref={endRef} />
      </div>

      <form className="border-t border-border p-3" onSubmit={(e) => { e.preventDefault(); void send(input); }}>
        <div className="flex items-end gap-2">
          <Textarea rows={2} value={input} onChange={(e) => setInput(e.target.value)} maxLength={8000} disabled={!aiConfigured}
            placeholder={aiConfigured ? "Pergunte sobre seus artigos, anotações, patologias…" : "Configure a IA no servidor para usar o assistente."}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(input); } }} aria-label="Mensagem" className="min-h-[52px]" />
          {pending ? (
            <Button variant="outline" size="icon" aria-label="Cancelar" onClick={() => abortRef.current?.abort()}><Square /></Button>
          ) : (
            <Button type="submit" size="icon" aria-label="Enviar" disabled={!aiConfigured || !input.trim()}><Send /></Button>
          )}
        </div>
        <p className="mt-1.5 text-[11px] text-muted-foreground">Uso educacional. Verifique as fontes. Conteúdos dos documentos são tratados como dados, nunca como instruções.</p>
      </form>
    </div>
  );
}
