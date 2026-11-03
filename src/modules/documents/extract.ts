import "server-only";
import { readZipEntries } from "@/lib/utils/zip";
import type { PageText } from "@/lib/ai/chunking";

const XML_ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'" };

function decodeXml(s: string): string {
  return s
    .replace(/&(amp|lt|gt|quot|apos);/g, (m) => XML_ENTITIES[m])
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)));
}

/** Texto de um XML do Office: parágrafos (<w:p>/<a:p>) viram quebras de linha. */
function officeXmlText(xml: string, textTag: RegExp, paraTag: RegExp): string {
  return decodeXml(
    xml
      .replace(paraTag, "\n")
      .replace(/<w:tab\/>/g, "\t")
      .replace(/<w:br\/>/g, "\n")
      .replace(textTag, (_m, inner: string) => inner)
      .replace(/<[^>]+>/g, ""),
  );
}

async function extractPdf(buf: Buffer): Promise<{ pages: PageText[]; pageCount: number }> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const { totalPages, text } = await extractText(pdf, { mergePages: false });
  const list = Array.isArray(text) ? text : [text];
  return { pages: list.map((t, i) => ({ page: i + 1, text: t })), pageCount: totalPages };
}

function extractDocx(buf: Buffer): { pages: PageText[]; pageCount: null } {
  const entries = readZipEntries(buf, (n) => n === "word/document.xml");
  const xml = entries.get("word/document.xml")?.toString("utf8") ?? "";
  return { pages: [{ page: null, text: officeXmlText(xml, /<w:t[^>]*>([\s\S]*?)<\/w:t>/g, /<\/w:p>/g) }], pageCount: null };
}

function extractPptx(buf: Buffer): { pages: PageText[]; pageCount: number } {
  const entries = readZipEntries(buf, (n) => /^ppt\/slides\/slide\d+\.xml$/.test(n));
  const slides = Array.from(entries.entries())
    .map(([name, data]) => ({ n: Number(/slide(\d+)\.xml$/.exec(name)?.[1] ?? 0), xml: data.toString("utf8") }))
    .sort((a, b) => a.n - b.n);
  return {
    pages: slides.map((s) => ({ page: s.n, text: officeXmlText(s.xml, /<a:t>([\s\S]*?)<\/a:t>/g, /<\/a:p>/g) })),
    pageCount: slides.length,
  };
}

function extractXlsx(buf: Buffer): { pages: PageText[]; pageCount: number } {
  const entries = readZipEntries(buf, (n) => n === "xl/sharedStrings.xml" || /^xl\/worksheets\/sheet\d+\.xml$/.test(n));
  const shared = Array.from((entries.get("xl/sharedStrings.xml")?.toString("utf8") ?? "").matchAll(/<si>([\s\S]*?)<\/si>/g)).map((m) =>
    decodeXml(m[1].replace(/<[^>]+>/g, "")),
  );
  const sheets = Array.from(entries.entries())
    .filter(([n]) => n.includes("worksheets"))
    .map(([name, data]) => {
      const xml = data.toString("utf8");
      const rows = Array.from(xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)).map((r) =>
        Array.from(r[1].matchAll(/<c([^>]*)>([\s\S]*?)<\/c>/g))
          .map((c) => {
            const v = /<v>([\s\S]*?)<\/v>/.exec(c[2])?.[1] ?? /<t[^>]*>([\s\S]*?)<\/t>/.exec(c[2])?.[1] ?? "";
            return /t="s"/.test(c[1]) ? (shared[Number(v)] ?? "") : decodeXml(v);
          })
          .join(" | "),
      );
      return { n: Number(/sheet(\d+)\.xml$/.exec(name)?.[1] ?? 0), text: rows.join("\n") };
    })
    .sort((a, b) => a.n - b.n);
  return { pages: sheets.map((s) => ({ page: s.n, text: s.text })), pageCount: sheets.length };
}

export async function extractDocumentText(mime: string, buf: Buffer): Promise<{ pages: PageText[]; pageCount: number | null } | null> {
  switch (mime) {
    case "application/pdf":
      return extractPdf(buf);
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return extractDocx(buf);
    case "application/vnd.openxmlformats-officedocument.presentationml.presentation":
      return extractPptx(buf);
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
      return extractXlsx(buf);
    default:
      return null;
  }
}
