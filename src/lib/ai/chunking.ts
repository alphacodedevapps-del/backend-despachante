/** Divisão de texto em trechos com sobreposição, preservando a página de origem. */

export interface PageText {
  page: number | null;
  text: string;
}

export interface Chunk {
  index: number;
  page: number | null;
  content: string;
  tokenEstimate: number;
}

export function normalizeWhitespace(text: string): string {
  return text
    .replace(/\u0000/g, "")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Quebra cada página em trechos de até `size` caracteres, preferindo cortes
 * em parágrafos/frases, com `overlap` caracteres de sobreposição.
 */
export function chunkPages(pages: PageText[], size = 1400, overlap = 200): Chunk[] {
  const chunks: Chunk[] = [];
  for (const p of pages) {
    const text = normalizeWhitespace(p.text);
    if (!text) continue;
    let start = 0;
    while (start < text.length) {
      let end = Math.min(text.length, start + size);
      if (end < text.length) {
        const window = text.slice(start, end);
        const cut = Math.max(window.lastIndexOf("\n\n"), window.lastIndexOf(". "), window.lastIndexOf("\n"));
        if (cut > size * 0.5) end = start + cut + 1;
      }
      const content = text.slice(start, end).trim();
      if (content.length >= 20 || (content.length > 0 && chunks.length === 0)) {
        chunks.push({ index: chunks.length, page: p.page, content, tokenEstimate: estimateTokens(content) });
      }
      if (end >= text.length) break;
      start = Math.max(end - overlap, start + 1);
    }
  }
  return chunks;
}
