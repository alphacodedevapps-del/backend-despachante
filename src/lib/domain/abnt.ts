/**
 * Gerador de referências no padrão ABNT NBR 6023 (simplificado).
 * Usa SOMENTE os metadados informados — nada é inventado. Elementos
 * ausentes são omitidos e listados em `missing` para revisão manual.
 */

export type ReferenceType = "artigo" | "livro" | "capitulo" | "site" | "tese" | "outro";

export interface ReferenceInput {
  reference_type?: ReferenceType | string | null;
  authors?: string | null;
  title?: string | null;
  subtitle?: string | null;
  source?: string | null;
  edition?: string | null;
  place?: string | null;
  publisher?: string | null;
  volume?: string | null;
  issue?: string | null;
  pages?: string | null;
  year?: number | string | null;
  doi?: string | null;
  url?: string | null;
  access_date?: string | null;
}

export interface ReferenceSegment {
  text: string;
  bold?: boolean;
}

export interface ReferenceResult {
  segments: ReferenceSegment[];
  text: string;
  missing: string[];
}

const MONTHS = ["jan.", "fev.", "mar.", "abr.", "maio", "jun.", "jul.", "ago.", "set.", "out.", "nov.", "dez."];

const clean = (s: string | number | null | undefined) => (s === null || s === undefined ? "" : String(s).trim());

/** "Silva, João; Maria Souza" → ["SILVA, João", "SOUZA, Maria"] */
export function formatAuthors(raw: string | null | undefined): string[] {
  const list = clean(raw)
    .split(/;|\n/)
    .map((a) => a.trim())
    .filter(Boolean);
  return list.map((a) => {
    if (a.includes(",")) {
      const [surname, ...rest] = a.split(",");
      const given = rest.join(",").trim();
      return given ? `${surname.trim().toUpperCase()}, ${given}` : surname.trim().toUpperCase();
    }
    const parts = a.split(/\s+/);
    if (parts.length === 1) return parts[0].toUpperCase();
    const surname = parts.pop() as string;
    return `${surname.toUpperCase()}, ${parts.join(" ")}`;
  });
}

function authorBlock(raw: string | null | undefined): string {
  const authors = formatAuthors(raw);
  if (authors.length === 0) return "";
  if (authors.length > 3) return `${authors[0]} et al.`;
  return authors.join("; ");
}

export function formatAccessDate(iso: string | null | undefined): string {
  const v = clean(iso);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return "";
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

function endWithPeriod(s: string): string {
  return /[.!?]$/.test(s) ? s : `${s}.`;
}

/** Sem autor: a entrada é feita pelo título, com a primeira palavra em maiúsculas. */
function titleEntry(title: string): string {
  const [first, ...rest] = title.split(/\s+/);
  return [first.toUpperCase(), ...rest].join(" ");
}

export function generateAbntReference(input: ReferenceInput): ReferenceResult {
  const type = (clean(input.reference_type) || "artigo") as ReferenceType;
  const authors = authorBlock(input.authors);
  const title = clean(input.title);
  const subtitle = clean(input.subtitle);
  const source = clean(input.source);
  const year = clean(input.year);
  const place = clean(input.place);
  const publisher = clean(input.publisher);
  const edition = clean(input.edition);
  const volume = clean(input.volume);
  const issue = clean(input.issue);
  const pages = clean(input.pages);
  const doi = clean(input.doi).replace(/^https?:\/\/(dx\.)?doi\.org\//i, "");
  const url = clean(input.url);
  const access = formatAccessDate(input.access_date);

  const missing: string[] = [];
  if (!authors) missing.push("autoria");
  if (!title) missing.push("título");
  if (!year) missing.push("ano");

  const seg: ReferenceSegment[] = [];
  const push = (text: string, bold = false) => {
    if (text) seg.push({ text, bold });
  };

  const fullTitle = title ? (subtitle ? `${title}: ${subtitle}` : title) : "";
  const pagesText = pages ? `p. ${pages.replace(/^p\.?\s*/i, "")}` : "";

  if (authors) push(`${endWithPeriod(authors)} `);

  switch (type) {
    case "artigo": {
      if (!source) missing.push("revista");
      if (fullTitle) push(authors ? `${endWithPeriod(fullTitle)} ` : `${endWithPeriod(titleEntry(fullTitle))} `);
      if (source) push(source, true);
      const tail = [place, volume && `v. ${volume}`, issue && `n. ${issue}`, pagesText, year].filter(Boolean).join(", ");
      if (source || tail) push(tail ? `, ${tail}.` : ".");
      break;
    }
    case "livro":
    case "tese": {
      if (fullTitle) {
        if (authors) {
          push(title, true);
          push(subtitle ? `: ${subtitle}. ` : ". ");
        } else {
          push(`${endWithPeriod(titleEntry(fullTitle))} `);
        }
      }
      if (edition) push(`${edition.replace(/\s*ed\.?$/i, "")}. ed. `);
      if (type === "tese") {
        if (year) push(`${year}. `);
        const inst = [publisher, place].filter(Boolean).join(", ");
        push(`Trabalho acadêmico${inst ? ` – ${inst}` : ""}${year ? `, ${year}` : ""}.`);
      } else {
        if (!publisher) missing.push("editora");
        const imprint = [place ? `${place}: ${publisher || "[s. n.]"}` : publisher, year].filter(Boolean).join(", ");
        push(imprint ? `${imprint}.` : "");
      }
      break;
    }
    case "capitulo": {
      if (fullTitle) push(authors ? `${endWithPeriod(fullTitle)} ` : `${endWithPeriod(titleEntry(fullTitle))} `);
      if (!source) missing.push("obra (livro)");
      if (source) {
        push("In: ");
        push(source, true);
        push(". ");
      }
      if (edition) push(`${edition.replace(/\s*ed\.?$/i, "")}. ed. `);
      const imprint = [place ? `${place}: ${publisher || "[s. n.]"}` : publisher, year].filter(Boolean).join(", ");
      if (imprint) push(`${imprint}. `);
      if (pagesText) push(`${pagesText}.`);
      break;
    }
    case "site":
    case "outro": {
      if (fullTitle) {
        if (authors) {
          push(title, true);
          push(subtitle ? `: ${subtitle}. ` : ". ");
        } else push(`${endWithPeriod(titleEntry(fullTitle))} `);
      }
      if (source) push(`${endWithPeriod(source)} `);
      if (year) push(`${year}.`);
      if (type === "site" && !url) missing.push("URL");
      break;
    }
  }

  if (doi) push(` DOI: ${doi}.`);
  if (url) {
    push(` Disponível em: ${url}.`);
    if (access) push(` Acesso em: ${access}.`);
    else missing.push("data de acesso");
  }

  // Normaliza espaços
  const normalized: ReferenceSegment[] = [];
  for (const s of seg) {
    const prev = normalized[normalized.length - 1];
    if (prev && !!prev.bold === !!s.bold) prev.text += s.text;
    else normalized.push({ ...s });
  }
  const text = normalized
    .map((s) => s.text)
    .join("")
    .replace(/\s+/g, " ")
    .replace(/\s+([.,:])/g, "$1")
    .replace(/\.\./g, ".")
    .trim();

  return { segments: normalized, text, missing: Array.from(new Set(missing)) };
}
