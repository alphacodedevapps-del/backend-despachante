import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/session";
import { AiError, getChatProvider, type ChatTurn } from "@/lib/ai";
import { getAiConfig } from "@/lib/ai/config";
import { assertWithinLimits, logUsage } from "@/lib/ai/usage";
import { parseContextRef, retrieveContext, SYSTEM_PROMPT } from "@/modules/assistant/context";

export const maxDuration = 120;

const bodySchema = z.object({
  conversationId: z.string().uuid().nullable().optional(),
  message: z.string().trim().min(1, "Escreva uma pergunta.").max(8000, "Pergunta muito longa (máx. 8.000 caracteres)."),
  context: z.string().max(100).nullable().optional(),
  topic: z.string().max(100).nullable().optional(),
});

function jsonError(message: string, status: number, kind?: string) {
  return NextResponse.json({ error: message, kind }, { status });
}

export async function POST(request: NextRequest) {
  const ctx = await getSessionContext();
  if (!ctx) return jsonError("Sessão expirada. Entre novamente.", 401);

  let body: z.infer<typeof bodySchema>;
  try {
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "Requisição inválida.", 400);
    body = parsed.data;
  } catch {
    return jsonError("Requisição inválida.", 400);
  }

  const supabase = await createClient();
  const cfg = getAiConfig();

  // Workspace com IA desativada pelo administrador
  const { data: wsSettings } = await supabase.from("workspace_settings").select("ai_enabled").eq("workspace_id", ctx.workspace.id).maybeSingle();
  if (wsSettings && wsSettings.ai_enabled === false) return jsonError("A IA está desativada neste workspace.", 403, "disabled");

  // Conversa existente ou nova
  let conversationId = body.conversationId ?? null;
  let contextRef = parseContextRef(body.context);
  if (conversationId) {
    const { data: conv } = await supabase.from("ai_conversations").select("id, workspace_id, context_type, context_id").eq("id", conversationId).maybeSingle();
    if (!conv) return jsonError("Conversa não encontrada.", 404);
    if (conv.workspace_id !== ctx.workspace.id) return jsonError("Esta conversa pertence a outro workspace. Alterne o workspace para continuá-la.", 409);
    contextRef = conv.context_type && conv.context_id ? { type: conv.context_type, id: conv.context_id } : null;
  } else {
    const { data: conv, error } = await supabase
      .from("ai_conversations")
      .insert({
        workspace_id: ctx.workspace.id,
        created_by: ctx.user.id,
        title: body.message.slice(0, 80),
        topic: body.topic ?? null,
        context_type: contextRef?.type ?? null,
        context_id: contextRef?.id ?? null,
      })
      .select("id")
      .single();
    if (error || !conv) return jsonError("Não foi possível criar a conversa.", 500);
    conversationId = conv.id as string;
  }

  // Histórico (últimas mensagens)
  const { data: history } = await supabase
    .from("ai_messages")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(12);

  const { error: userMsgError } = await supabase.from("ai_messages").insert({
    conversation_id: conversationId,
    workspace_id: ctx.workspace.id,
    created_by: ctx.user.id,
    role: "user",
    content: body.message,
  });
  if (userMsgError) return jsonError("Não foi possível registrar a mensagem.", 500);

  // Sem provedor configurado: não simula resposta.
  let provider;
  try {
    provider = getChatProvider();
  } catch (e) {
    return NextResponse.json({ conversationId, error: (e as Error).message, kind: "not_configured" }, { status: 503 });
  }

  try {
    await assertWithinLimits(supabase, ctx.user.id);
  } catch (e) {
    await logUsage(supabase, { userId: ctx.user.id, workspaceId: ctx.workspace.id, provider: provider.name, model: provider.model, operation: "chat", status: "limite", error: (e as Error).message });
    return NextResponse.json({ conversationId, error: (e as Error).message, kind: "limit" }, { status: 429 });
  }

  const started = Date.now();
  try {
    const maxSources = Math.min(12, Math.max(3, Number(ctx.preferences?.ai_prefs?.max_sources ?? 8)));
    const retrieved = await retrieveContext(supabase, ctx.workspace.id, body.message, contextRef, maxSources);
    if (retrieved.embeddingTokens) {
      await logUsage(supabase, { userId: ctx.user.id, workspaceId: ctx.workspace.id, provider: "openai", model: cfg.embeddingModel, operation: "embedding", status: "ok", tokensIn: retrieved.embeddingTokens });
    }

    const turns: ChatTurn[] = ((history ?? []) as ChatTurn[]).reverse().map((m) => ({ role: m.role, content: m.content.slice(0, 6000) }));
    const contextBlock = [
      retrieved.text ? `<fontes>\n${retrieved.text}\n</fontes>` : "<fontes>\n(nenhuma fonte encontrada nos materiais autorizados)\n</fontes>",
      retrieved.overview ? `<panorama_do_workspace>\n${retrieved.overview}\n</panorama_do_workspace>` : "",
      `Pergunta do usuário:\n${body.message}`,
    ]
      .filter(Boolean)
      .join("\n\n");
    turns.push({ role: "user", content: contextBlock });

    const result = await provider.chat({ system: SYSTEM_PROMPT, messages: turns, maxTokens: cfg.maxOutputTokens, signal: request.signal });

    // Mantém apenas citações efetivamente referenciadas (ou todas, se o modelo não numerou).
    const used = new Set(Array.from(result.text.matchAll(/\[(\d{1,2})\]/g)).map((m) => Number(m[1])));
    const citations = used.size ? retrieved.citations.filter((c) => used.has(c.n)) : retrieved.citations;

    const { data: saved } = await supabase
      .from("ai_messages")
      .insert({
        conversation_id: conversationId,
        workspace_id: ctx.workspace.id,
        created_by: ctx.user.id,
        role: "assistant",
        content: result.text || "(resposta vazia)",
        citations,
        provider: result.provider,
        model: result.model,
        tokens_in: result.tokensIn,
        tokens_out: result.tokensOut,
      })
      .select("id, role, content, citations, created_at")
      .single();

    await logUsage(supabase, {
      userId: ctx.user.id,
      workspaceId: ctx.workspace.id,
      provider: result.provider,
      model: result.model,
      operation: "chat",
      status: "ok",
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      latencyMs: Date.now() - started,
    });

    return NextResponse.json({ conversationId, message: saved });
  } catch (e) {
    const err = e instanceof AiError ? e : new AiError("Falha inesperada ao consultar a IA.", "provider");
    await logUsage(supabase, {
      userId: ctx.user.id,
      workspaceId: ctx.workspace.id,
      provider: provider.name,
      model: provider.model,
      operation: "chat",
      status: err.kind === "cancelled" ? "cancelado" : "erro",
      latencyMs: Date.now() - started,
      error: err.message,
    });
    const status = err.kind === "rate_limited" ? 429 : err.kind === "cancelled" ? 499 : err.kind === "bad_request" ? 400 : 502;
    return NextResponse.json({ conversationId, error: err.message, kind: err.kind }, { status });
  }
}
