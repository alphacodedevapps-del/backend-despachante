/**
 * Leitura de metadados de artigos a partir de TEXTO (PDF ou OCR de foto).
 * Sem IA: usa padrões e regras. Só preenche o que encontra com segurança;
 * o restante fica vazio para o usuário preencher.
 */

export interface ParsedArticle {
  title: string | null;
  doi: string | null;
  year: number | null;
  journal: string | null;
  url: string | null;
  keywords: string[];
  /** Resumo do artigo (vai para o campo Objetivo, para revisão). */
  abstract: string | null;
}

const DOI_RE = /\b(10\.\d{4,9}\/[^\s"<>,;]+)/i;
const URL_RE = /https?:\/\/[^\s"<>)]+/i;
const YEAR_RE = /\b(19[5-9]\d|20[0-4]\d)\b/;
const KEYWORDS_RE = /(?:palavras?[\s-]*chave|keywords?|descritores)\s*[:\-–—]?\s*([^\n]+)/i;
const ABSTRACT_RE = /(?:^|\n)\s*(?:resumo|abstract)\s*[:\-–—]?\s*\n?([\s\S]+?)(?=\n\s*(?:palavras?[\s-]*chave|keywords?|descritores|introdu[cç][aã]o|background|1\s*[.)]?\s+introdu)|$)/i;
const JOURNAL_RE = /((?:revista|journal|periódico|periodico)\s+[^\n]{3,120})/i;
const NOISE_RE = /resumo|abstract|palavras|keywords|universidade|university|doi|volume|vol\.|issn|artigo original|original article|https?:|@|revista|journal/i;

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

export function parseArticleText(raw: string, maxChars = 60_000): ParsedArticle {
  const text = raw.replace(/\r/g, "").slice(0, maxChars);

  const doiMatch = DOI_RE.exec(text);
  const doi = doiMatch ? doiMatch[1].replace(/[.)]+$/, "") : null;

  const yearMatch = YEAR_RE.exec(text);
  const year = yearMatch ? Number(yearMatch[1]) : null;

  const urlMatch = URL_RE.exec(text);
  const url = urlMatch && !/doi\.org/i.test(urlMatch[0]) ? urlMatch[0].replace(/[.,;]+$/, "") : null;

  const kwMatch = KEYWORDS_RE.exec(text);
  const keywords = kwMatch
    ? kwMatch[1]
        .split(/[;,·•|]/)
        .map((k) => clean(k).replace(/\.$/, ""))
        .filter((k) => k.length >= 2 && k.length <= 60)
        .slice(0, 20)
    : [];

  const absMatch = ABSTRACT_RE.exec(text);
  const abstract = absMatch ? clean(absMatch[1]).slice(0, 4000) || null : null;

  const journalMatch = JOURNAL_RE.exec(text);
  const journal = journalMatch ? clean(journalMatch[1]).replace(/[,.;:]+$/, "").slice(0, 200) : null;

  // Título: primeira linha com cara de título (3+ palavras, sem termos de cabeçalho)
  const title =
    text
      .split("\n")
      .map((l) => clean(l))
      .find((l) => l.length >= 15 && l.length <= 250 && l.split(" ").length >= 3 && !NOISE_RE.test(l) && !/^\d/.test(l)) ?? null;

  return { title, doi, year, journal, url, keywords, abstract };
}
