"use server";

import { getSessionContext } from "@/lib/session";
import { canWrite } from "@/lib/permissions";
import { fail, type ActionResult } from "@/lib/errors";
import { hasActiveAccess } from "@/lib/billing/access";
import { parseArticleText, type ParsedArticle } from "@/lib/domain/article-parse";
import { extractDocumentText } from "@/modules/documents/extract";
import { matchesSignature } from "@/modules/documents/constants";

const MAX_PDF_BYTES = 15 * 1024 * 1024;
const PDF_MIME = "application/pdf";

/** Retorna a mensagem de bloqueio, ou null se pode importar. */
async function blockReason(): Promise<string | null> {
  const ctx = await getSessionContext();
  if (!ctx) return "Sessão expirada.";
  if (!canWrite(ctx.workspace.role)) return "Seu papel neste workspace é somente leitura.";
  if (!(await hasActiveAccess())) return "Sua assinatura não está ativa.";
  return null;
}

/** Lê os metadados de um PDF de artigo (apenas as primeiras páginas). Nada é salvo. */
export async function parseArticlePdfAction(form: FormData): Promise<ActionResult<{ article: ParsedArticle; filled: string[]; pages: number }>> {
  const blocked = await blockReason();
  if (blocked) return fail(blocked);
  const file = form.get("pdf");
  if (!(file instanceof File) || file.size === 0) return fail("Selecione um arquivo PDF.");
  if (file.size > MAX_PDF_BYTES) return fail("O PDF deve ter até 15 MB.");
  const buf = Buffer.from(await file.arrayBuffer());
  if (!matchesSignature(PDF_MIME, buf.subarray(0, 8))) return fail("O arquivo não é um PDF válido.");
  try {
    const extracted = await extractDocumentText(PDF_MIME, buf);
    const firstPages = (extracted?.pages ?? []).slice(0, 3).map((p) => p.text).join("\n");
    if (!firstPages.trim()) return fail("Não encontrei texto neste PDF (pode ser digitalizado). Use a foto da primeira página.");
    return finish(firstPages, extracted?.pages.length ?? 0);
  } catch {
    return fail("Não foi possível ler este PDF.");
  }
}

/** Lê os metadados a partir do texto reconhecido de uma foto (OCR feito no navegador). */
export async function parseArticleOcrTextAction(text: string): Promise<ActionResult<{ article: ParsedArticle; filled: string[]; pages: number }>> {
  const blocked = await blockReason();
  if (blocked) return fail(blocked);
  if (typeof text !== "string" || text.trim().length < 20) return fail("Não consegui reconhecer texto suficiente nessas imagens. Tente fotos mais nítidas.");
  return finish(text.slice(0, 60_000), 0);
}

function finish(text: string, pages: number): ActionResult<{ article: ParsedArticle; filled: string[]; pages: number }> {
  const article = parseArticleText(text);
  const filled = Object.entries(article)
    .filter(([, v]) => (Array.isArray(v) ? v.length > 0 : v !== null && v !== undefined))
    .map(([k]) => k);
  if (filled.length === 0) return fail("Não encontrei dados reconhecíveis (título, DOI, ano ou palavras-chave). Preencha manualmente.");
  return { ok: true, data: { article, filled, pages } };
}

