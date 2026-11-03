export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50 MB (igual ao limite do bucket)

export const ALLOWED_TYPES: Record<string, { ext: string[]; label: string; indexable: boolean }> = {
  "application/pdf": { ext: ["pdf"], label: "PDF", indexable: true },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": { ext: ["docx"], label: "Word (DOCX)", indexable: true },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": { ext: ["pptx"], label: "Slides (PPTX)", indexable: true },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": { ext: ["xlsx"], label: "Planilha (XLSX)", indexable: true },
  "image/png": { ext: ["png"], label: "Imagem PNG", indexable: false },
  "image/jpeg": { ext: ["jpg", "jpeg"], label: "Imagem JPEG", indexable: false },
};

export const ACCEPT_ATTR = Object.entries(ALLOWED_TYPES)
  .flatMap(([mime, v]) => [mime, ...v.ext.map((e) => `.${e}`)])
  .join(",");

export const DOCUMENT_CATEGORIES = [
  { value: "material", label: "Material de aula" },
  { value: "slide", label: "Slides" },
  { value: "artigo", label: "Artigo" },
  { value: "livro", label: "Livro / capítulo" },
  { value: "imagem", label: "Imagem" },
  { value: "certificado", label: "Certificado" },
  { value: "documento", label: "Documento" },
  { value: "outro", label: "Outro" },
] as const;

export const PROCESSING_LABELS: Record<string, string> = {
  aguardando: "Aguardando processamento",
  processando: "Processando",
  concluido: "Concluído (pesquisável pela IA)",
  falha: "Falha",
  nao_suportado: "Sem texto indexável",
};

/** Detecta o MIME pelo conteúdo/extensão e valida contra a lista permitida. */
export function resolveMime(fileName: string, declared: string): string | null {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  if (ALLOWED_TYPES[declared]?.ext.includes(ext)) return declared;
  const byExt = Object.entries(ALLOWED_TYPES).find(([, v]) => v.ext.includes(ext));
  return byExt ? byExt[0] : null;
}

/** Nome seguro para o caminho no Storage. */
export function safeFileName(name: string): string {
  const base = name.normalize("NFD").replace(/[̀-ͯ]/g, "");
  const cleaned = base.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^[-.]+/, "");
  return (cleaned || "arquivo").slice(-120);
}

/** Verifica a assinatura binária (magic bytes) do arquivo. */
export function matchesSignature(mime: string, bytes: Uint8Array): boolean {
  const starts = (sig: number[]) => sig.every((b, i) => bytes[i] === b);
  if (mime === "application/pdf") return starts([0x25, 0x50, 0x44, 0x46]); // %PDF
  if (mime === "image/png") return starts([0x89, 0x50, 0x4e, 0x47]);
  if (mime === "image/jpeg") return starts([0xff, 0xd8, 0xff]);
  if (mime.startsWith("application/vnd.openxmlformats")) return starts([0x50, 0x4b, 0x03, 0x04]); // ZIP
  return false;
}
