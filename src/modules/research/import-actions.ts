"use server";

import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/session";
import { canWrite } from "@/lib/permissions";
import { fail, type ActionResult } from "@/lib/errors";
import { AiError, getChatProvider, type ChatTurn } from "@/lib/ai";
import { assertWithinLimits, logUsage } from "@/lib/ai/usage";
import { hasActiveAccess } from "@/lib/billing/access";
import type { ImageInput } from "@/lib/ai/providers/types";
import { buildExtractionPrompt, detectImage, EXTRACTION_SYSTEM, extractedSchema, parseExtractionJson, type ExtractedArticle } from "./article-extract";

export type { ExtractedArticle };

/** Limites (o navegador já reduz as imagens antes do envio). */
const MAX_IMAGES = 6;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

/**
 * Lê imagens (PNG/JPG/WebP) de páginas de um artigo e devolve os campos para
 * pré-preencher o formulário. Nada é salvo: o usuário revisa antes de criar.
 */
export async function extractArticleFromImagesAction(form: FormData): Promise<ActionResult<{ article: ExtractedArticle; filled: string[] }>> {
  const ctx = await getSessionContext();
  if (!ctx) return fail("Sessão expirada.");
  if (!canWrite(ctx.workspace.role)) return fail("Seu papel neste workspace é somente leitura.");
  if (!(await hasActiveAccess())) return fail("Sua assinatura não está ativa.");

  const files = form.getAll("images").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return fail("Selecione ao menos uma imagem do artigo.");
  if (files.length > MAX_IMAGES) return fail(`Envie no máximo ${MAX_IMAGES} imagens por vez.`);

  const images: ImageInput[] = [];
  for (const f of files) {
    if (f.size > MAX_IMAGE_BYTES) return fail(`A imagem "${f.name}" é muito grande (máx. 4 MB).`);
    const bytes = new Uint8Array(await f.arrayBuffer());
    const mediaType = detectImage(bytes);
    if (!mediaType) return fail(`"${f.name}" não é uma imagem PNG, JPG ou WebP válida.`);
    images.push({ mediaType, data: Buffer.from(bytes).toString("base64") });
  }

  const supabase = await createClient();
  let provider;
  try {
    provider = getChatProvider();
  } catch (e) {
    return fail((e as Error).message);
  }
  const started = Date.now();
  try {
    await assertWithinLimits(supabase, ctx.user.id);
    const messages: ChatTurn[] = [{ role: "user", content: buildExtractionPrompt(), images }];
    const res = await provider.chat({ system: EXTRACTION_SYSTEM, messages, maxTokens: 4000 });
    await logUsage(supabase, { userId: ctx.user.id, workspaceId: ctx.workspace.id, provider: res.provider, model: res.model, operation: "generation", status: "ok", tokensIn: res.tokensIn, tokensOut: res.tokensOut, latencyMs: Date.now() - started });
    const parsed = extractedSchema.safeParse(parseExtractionJson(res.text));
    if (!parsed.success) return fail("A IA retornou dados em formato inesperado. Tente novamente.");
    const article = parsed.data;
    const filled = Object.entries(article)
      .filter(([, v]) => (Array.isArray(v) ? v.length > 0 : v !== null && v !== undefined))
      .map(([k]) => k);
    if (filled.length === 0) return fail("Não foi possível identificar informações do artigo nessas imagens. Tente fotos mais nítidas e bem enquadradas.");
    return { ok: true, data: { article, filled } };
  } catch (e) {
    const msg = e instanceof AiError ? e.message : "Falha ao ler as imagens.";
    await logUsage(supabase, { userId: ctx.user.id, workspaceId: ctx.workspace.id, provider: provider.name, model: provider.model, operation: "generation", status: e instanceof AiError && e.kind === "limit" ? "limite" : "erro", error: msg, latencyMs: Date.now() - started });
    return fail(msg);
  }
}
