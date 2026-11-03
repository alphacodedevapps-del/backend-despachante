import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { chunkPages } from "@/lib/ai/chunking";
import { embedTexts, embeddingsAvailable, toPgVector } from "@/lib/ai";
import { logUsage } from "@/lib/ai/usage";
import { ALLOWED_TYPES, matchesSignature } from "./constants";
import { extractDocumentText } from "./extract";

const MAX_CHUNKS = 2000;

/**
 * Pipeline: download do Storage → extração de texto por página → divisão em
 * trechos → embeddings (se configurado) → gravação dos trechos → status.
 * Executado com o cliente do usuário (RLS aplicada). Idempotente: remove
 * trechos anteriores antes de reindexar.
 */
export async function processDocument(supabase: SupabaseClient, documentId: string, userId: string): Promise<void> {
  const { data: doc } = await supabase
    .from("documents")
    .select("id, workspace_id, storage_path, mime_type, upload_status")
    .eq("id", documentId)
    .maybeSingle();
  if (!doc || doc.upload_status !== "enviado") return;

  const { data: prevJob } = await supabase.from("document_processing_jobs").select("attempt").eq("document_id", documentId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const { data: job } = await supabase
    .from("document_processing_jobs")
    .insert({ document_id: documentId, workspace_id: doc.workspace_id, created_by: userId, status: "processando", attempt: (prevJob?.attempt ?? 0) + 1, started_at: new Date().toISOString() })
    .select("id")
    .single();

  const finish = async (status: "concluido" | "falha" | "nao_suportado", extra: Record<string, unknown> = {}, error?: string) => {
    await supabase
      .from("documents")
      .update({
        processing_status: status,
        processing_error: error ?? null,
        indexed_at: status === "concluido" ? new Date().toISOString() : null,
        ...("chunk_count" in extra ? { chunk_count: extra.chunk_count } : {}),
        ...("page_count" in extra ? { page_count: extra.page_count } : {}),
      })
      .eq("id", documentId);
    if (job) {
      await supabase
        .from("document_processing_jobs")
        .update({ status: status === "nao_suportado" ? "concluido" : status, error: error ?? null, finished_at: new Date().toISOString(), stats: extra })
        .eq("id", job.id);
    }
  };

  await supabase.from("documents").update({ processing_status: "processando", processing_error: null }).eq("id", documentId);

  try {
    if (!ALLOWED_TYPES[doc.mime_type]?.indexable) {
      await supabase.from("document_chunks").delete().eq("document_id", documentId);
      await finish("nao_suportado", { chunk_count: 0 });
      return;
    }

    const { data: blob, error: dlError } = await supabase.storage.from("documents").download(doc.storage_path);
    if (dlError || !blob) throw new Error("Não foi possível baixar o arquivo do armazenamento.");
    const buf = Buffer.from(await blob.arrayBuffer());
    if (!matchesSignature(doc.mime_type, buf.subarray(0, 8))) throw new Error("O conteúdo do arquivo não corresponde ao tipo declarado.");

    const extracted = await extractDocumentText(doc.mime_type, buf);
    const chunks = chunkPages(extracted?.pages ?? []).slice(0, MAX_CHUNKS);

    // Remove indexação anterior (reprocessamento)
    await supabase.from("document_chunks").delete().eq("document_id", documentId);

    if (chunks.length === 0) {
      await finish("nao_suportado", { chunk_count: 0, page_count: extracted?.pageCount ?? null }, "Nenhum texto extraível (arquivo digitalizado ou sem texto).");
      return;
    }

    let vectors: number[][] | null = null;
    let embeddingModel: string | null = null;
    if (embeddingsAvailable()) {
      const t0 = Date.now();
      try {
        const res = await embedTexts(chunks.map((c) => c.content));
        vectors = res.vectors;
        embeddingModel = res.model;
        await logUsage(supabase, { userId, workspaceId: doc.workspace_id, provider: "openai", model: res.model, operation: "embedding", status: "ok", tokensIn: res.tokens, latencyMs: Date.now() - t0 });
      } catch (e) {
        await logUsage(supabase, { userId, workspaceId: doc.workspace_id, provider: "openai", model: "embeddings", operation: "embedding", status: "erro", error: (e as Error).message });
        throw new Error(`Falha ao gerar embeddings: ${(e as Error).message}`);
      }
    }

    for (let i = 0; i < chunks.length; i += 100) {
      const rows = chunks.slice(i, i + 100).map((c, j) => ({
        document_id: documentId,
        workspace_id: doc.workspace_id,
        created_by: userId,
        chunk_index: c.index,
        page_number: c.page,
        content: c.content,
        token_estimate: c.tokenEstimate,
        embedding_model: embeddingModel,
        ...(vectors ? { embedding: toPgVector(vectors[i + j]) } : {}),
      }));
      const { error } = await supabase.from("document_chunks").insert(rows);
      if (error) throw new Error(`Falha ao gravar trechos: ${error.message}`);
    }

    await finish("concluido", { chunk_count: chunks.length, page_count: extracted?.pageCount ?? null, embedding_model: embeddingModel ?? "somente busca textual" });
  } catch (e) {
    await finish("falha", {}, (e as Error).message.slice(0, 500));
  }
}
