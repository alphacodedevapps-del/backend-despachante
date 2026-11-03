"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/session";
import { fail, friendlyDbError, type ActionResult } from "@/lib/errors";
import { AiError, getChatProvider } from "@/lib/ai";
import { getAiConfig } from "@/lib/ai/config";
import { assertWithinLimits, logUsage } from "@/lib/ai/usage";
import { ENTITY_MAP } from "@/modules/entities/definitions";
import type { SearchHit } from "@/modules/relations/actions";
import { parseContextRef, recordToText, SYSTEM_PROMPT } from "./context";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function deleteConversationAction(id: string): Promise<ActionResult> {
  if (!UUID.test(id)) return fail("Conversa inválida.");
  const supabase = await createClient();
  const { data, error } = await supabase.from("ai_conversations").delete().eq("id", id).select("id");
  if (error) return fail(friendlyDbError(error));
  if (!data?.length) return fail("Conversa não encontrada.");
  revalidatePath("/assistente");
  return { ok: true, data: null };
}

export async function updateConversationAction(id: string, patch: { title?: string; topic?: string | null }): Promise<ActionResult> {
  if (!UUID.test(id)) return fail("Conversa inválida.");
  const parsed = z.object({ title: z.string().trim().min(1).max(200).optional(), topic: z.string().trim().max(100).nullable().optional() }).safeParse(patch);
  if (!parsed.success) return fail("Dados inválidos.");
  const supabase = await createClient();
  const { data, error } = await supabase.from("ai_conversations").update(parsed.data).eq("id", id).select("id");
  if (error) return fail(friendlyDbError(error));
  if (!data?.length) return fail("Conversa não encontrada.");
  revalidatePath("/assistente");
  return { ok: true, data: null };
}

/** Executa uma geração única (sem conversa), com limites e registro de uso. */
async function runGeneration(prompt: string, maxTokens = 3000): Promise<string> {
  const ctx = await getSessionContext();
  if (!ctx) throw new AiError("Sessão expirada.", "auth");
  const supabase = await createClient();
  const provider = getChatProvider();
  await assertWithinLimits(supabase, ctx.user.id);
  const started = Date.now();
  try {
    const res = await provider.chat({ system: SYSTEM_PROMPT, messages: [{ role: "user", content: prompt }], maxTokens: Math.min(maxTokens, getAiConfig().maxOutputTokens * 2) });
    await logUsage(supabase, { userId: ctx.user.id, workspaceId: ctx.workspace.id, provider: res.provider, model: res.model, operation: "generation", status: "ok", tokensIn: res.tokensIn, tokensOut: res.tokensOut, latencyMs: Date.now() - started });
    return res.text;
  } catch (e) {
    await logUsage(supabase, { userId: ctx.user.id, workspaceId: ctx.workspace.id, provider: provider.name, model: provider.model, operation: "generation", status: "erro", error: (e as Error).message });
    throw e;
  }
}

function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const raw = fenced ? fenced[1] : text;
  const start = raw.search(/[[{]/);
  const end = Math.max(raw.lastIndexOf("]"), raw.lastIndexOf("}"));
  if (start < 0 || end < start) throw new AiError("A IA não retornou um formato reconhecível. Tente novamente.", "provider");
  return JSON.parse(raw.slice(start, end + 1));
}

async function loadRecord(type: string, id: string) {
  const entity = ENTITY_MAP[type];
  if (!entity || !UUID.test(id)) return null;
  const ctx = await getSessionContext();
  if (!ctx) return null;
  const supabase = await createClient();
  const { data } = await supabase.from(entity.key).select("*").eq("id", id).eq("workspace_id", ctx.workspace.id).maybeSingle();
  if (!data) return null;
  const row = data as Record<string, unknown>;
  return { entity, row, title: String(row[entity.titleField] ?? entity.singular), text: recordToText(entity.key, row, 12000), ctx, supabase };
}

/** A IA sugere relacionamentos entre registros do workspace; o usuário aprova cada um. */
export async function suggestRelationsAction(type: string, id: string): Promise<{ ok: true; data: SearchHit[] } | { ok: false; error: string }> {
  const rec = await loadRecord(type, id);
  if (!rec) return { ok: false, error: "Registro não encontrado neste workspace." };
  try {
    const query = `${rec.title} ${String(rec.row.tags ?? "")}`.slice(0, 200);
    const { data: hits } = await rec.supabase.rpc("global_search", { p_query: query, p_workspace_id: rec.ctx.workspace.id, p_types: null, p_limit: 40 });
    const { data: links } = await rec.supabase
      .from("entity_links")
      .select("source_id, target_id")
      .or(`and(source_type.eq.${type},source_id.eq.${id}),and(target_type.eq.${type},target_id.eq.${id})`);
    const linked = new Set(((links ?? []) as { source_id: string; target_id: string }[]).flatMap((l) => [l.source_id, l.target_id]));

    // Candidatos adicionais por termos individuais do título
    const words = rec.title.split(/\s+/).filter((w) => w.length > 4).slice(0, 4);
    const extra = await Promise.all(words.map((w) => rec.supabase.rpc("global_search", { p_query: w, p_workspace_id: rec.ctx.workspace.id, p_types: null, p_limit: 10 })));
    type Hit = { entity_type: string; entity_id: string; title: string; subtitle: string | null; snippet: string | null };
    const all = new Map<string, Hit>();
    for (const h of [...((hits ?? []) as Hit[]), ...extra.flatMap((r) => (r.data ?? []) as Hit[])]) {
      if (h.entity_id === id || linked.has(h.entity_id)) continue;
      all.set(`${h.entity_type}:${h.entity_id}`, h);
    }
    const candidates = Array.from(all.values()).slice(0, 30);
    if (candidates.length === 0) return { ok: true, data: [] };

    const list = candidates.map((c, i) => `${i}. [${ENTITY_MAP[c.entity_type]?.singular ?? "Documento"}] ${c.title}${c.snippet ? ` — ${c.snippet.slice(0, 160)}` : ""}`).join("\n");
    const text = await runGeneration(
      `Registro de referência (${rec.entity.singular}): "${rec.title}"\n<fonte n="1">\n${rec.text.slice(0, 4000)}\n</fonte>\n\nCandidatos do mesmo workspace:\n${list}\n\nSelecione apenas os candidatos com relação acadêmica/clínica clara com o registro de referência. Responda SOMENTE com JSON no formato [{"i": <número do candidato>, "motivo": "<justificativa curta>"}]. Se nenhum for relevante, responda [].`,
      1200,
    );
    const parsed = z.array(z.object({ i: z.number().int(), motivo: z.string().max(400) })).safeParse(extractJson(text));
    if (!parsed.success) return { ok: false, error: "A IA retornou sugestões em formato inválido. Tente novamente." };
    return {
      ok: true,
      data: parsed.data
        .filter((s) => candidates[s.i])
        .slice(0, 12)
        .map((s) => ({ type: candidates[s.i].entity_type, id: candidates[s.i].entity_id, title: candidates[s.i].title, subtitle: candidates[s.i].subtitle, snippet: `Motivo: ${s.motivo}` })),
    };
  } catch (e) {
    return { ok: false, error: e instanceof AiError ? e.message : "Não foi possível gerar sugestões." };
  }
}

export interface GeneratedFlashcard {
  front: string;
  back: string;
  topic: string;
}
export interface GeneratedQuestion {
  statement: string;
  options: string[];
  correct_option: number;
  explanation: string;
}

/** Gera flashcards, questões ou texto (fichamento/resumo) a partir de um registro. Nada é salvo sem aprovação. */
export async function generateFromRecordAction(
  type: string,
  id: string,
  kind: "flashcards" | "questoes" | "fichamento" | "resumo" | "roteiro",
): Promise<ActionResult<{ flashcards?: GeneratedFlashcard[]; questions?: GeneratedQuestion[]; text?: string }>> {
  const rec = await loadRecord(type, id);
  if (!rec) return fail("Registro não encontrado neste workspace.");
  try {
    // Inclui trechos dos anexos indexados para enriquecer a geração.
    const { data: links } = await rec.supabase
      .from("entity_links")
      .select("source_type, source_id, target_type, target_id")
      .or(`and(source_type.eq.${type},source_id.eq.${id},target_type.eq.documents),and(target_type.eq.${type},target_id.eq.${id},source_type.eq.documents)`);
    const docIds = ((links ?? []) as { source_type: string; source_id: string; target_id: string }[]).map((l) => (l.source_type === "documents" ? l.source_id : l.target_id));
    let docText = "";
    if (docIds.length) {
      const { data: chunks } = await rec.supabase.from("document_chunks").select("content, page_number").in("document_id", docIds).order("chunk_index").limit(12);
      docText = ((chunks ?? []) as { content: string; page_number: number | null }[]).map((c) => `${c.page_number ? `(p. ${c.page_number}) ` : ""}${c.content}`).join("\n\n").slice(0, 14000);
    }
    const source = `<fonte n="1" titulo="${rec.title.replace(/"/g, "'")}">\n${rec.text}\n${docText ? `\nTrechos dos anexos:\n${docText}` : ""}\n</fonte>`;

    if (kind === "flashcards") {
      const text = await runGeneration(`${source}\n\nCrie de 5 a 12 flashcards de estudo baseados SOMENTE na fonte. Responda SOMENTE com JSON: [{"front": "...", "back": "...", "topic": "..."}].`);
      const parsed = z.array(z.object({ front: z.string().min(1).max(2000), back: z.string().min(1).max(4000), topic: z.string().max(200).default("") })).safeParse(extractJson(text));
      if (!parsed.success) return fail("A IA retornou flashcards em formato inválido. Tente novamente.");
      return { ok: true, data: { flashcards: parsed.data.slice(0, 20) } };
    }
    if (kind === "questoes") {
      const text = await runGeneration(`${source}\n\nCrie de 4 a 8 questões objetivas (4 ou 5 alternativas, apenas uma correta) baseadas SOMENTE na fonte. Responda SOMENTE com JSON: [{"statement": "...", "options": ["...", "..."], "correct_option": <índice começando em 0>, "explanation": "..."}].`);
      const parsed = z
        .array(z.object({ statement: z.string().min(1).max(4000), options: z.array(z.string().min(1).max(1000)).min(2).max(6), correct_option: z.number().int().min(0), explanation: z.string().max(4000).default("") }))
        .safeParse(extractJson(text));
      if (!parsed.success) return fail("A IA retornou questões em formato inválido. Tente novamente.");
      return { ok: true, data: { questions: parsed.data.filter((q) => q.correct_option < q.options.length).slice(0, 12) } };
    }
    const instructions = {
      fichamento: "Elabore um fichamento científico estruturado (objetivo, metodologia, amostra, principais resultados, conclusão, limitações e pontos para análise crítica). Use apenas o que está na fonte; indique 'não informado na fonte' quando faltar.",
      resumo: "Elabore um resumo de estudo claro e organizado em tópicos, apenas com base na fonte.",
      roteiro: "Elabore um roteiro de revisão em etapas, com os conceitos-chave, perguntas de autoavaliação e pontos de atenção, apenas com base na fonte.",
    }[kind];
    const text = await runGeneration(`${source}\n\n${instructions}`);
    return { ok: true, data: { text } };
  } catch (e) {
    return fail(e instanceof AiError ? e.message : "Não foi possível gerar o conteúdo.");
  }
}

/** Verifica um contexto vindo da URL (?contexto=tipo:id) e retorna seu título. */
export async function describeContextAction(ref: string): Promise<ActionResult<{ type: string; id: string; title: string; label: string } | null>> {
  const parsed = parseContextRef(ref);
  if (!parsed) return { ok: true, data: null };
  const supabase = await createClient();
  const { data } = await supabase.from("search_index").select("title").eq("entity_type", parsed.type).eq("entity_id", parsed.id).maybeSingle();
  if (!data) return { ok: true, data: null };
  return { ok: true, data: { ...parsed, title: data.title as string, label: parsed.type === "documents" ? "Documento" : (ENTITY_MAP[parsed.type]?.singular ?? parsed.type) } };
}
