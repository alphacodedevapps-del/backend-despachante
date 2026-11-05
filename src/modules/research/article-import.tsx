"use client";

import * as React from "react";
import { toast } from "sonner";
import { Camera, CheckCircle2, FileText, ImagePlus, Loader2, ScanText, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/input";
import { EntityForm } from "@/modules/entities/components/entity-form";
import { getEntity } from "@/modules/entities/definitions";
import type { FormValues } from "@/modules/entities/schema";
import type { RefOption } from "@/modules/entities/queries";
import { uploadDocument } from "@/modules/documents/upload-client";
import { parseArticleOcrTextAction, parseArticlePdfAction } from "./import-actions";
import type { ParsedArticle } from "@/lib/domain/article-parse";

const MAX_IMAGES = 6;
const MAX_SIDE = 2000;

interface Picked {
  id: string;
  file: File;
  preview: string;
}

/** Reduz a imagem no aparelho (lado máximo 2000 px, JPEG) para o OCR ser rápido. */
async function shrinkImage(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
  if (!blob) return file;
  return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
}

/** Reconhecimento de texto no próprio navegador (sem IA e sem enviar a imagem ao servidor). */
async function ocrImages(files: File[]): Promise<string> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("por+eng");
  try {
    const parts: string[] = [];
    for (const f of files) {
      const { data } = await worker.recognize(f);
      parts.push(data.text);
    }
    return parts.join("\n");
  } finally {
    await worker.terminate();
  }
}

function newId() {
  return Math.random().toString(36).slice(2, 10);
}

export function ArticleImportForm({ mode, recordId, initialValues, refOptions, cancelHref }: {
  mode: "create" | "edit";
  recordId?: string;
  initialValues: FormValues;
  refOptions: Record<string, RefOption[]>;
  cancelHref: string;
}) {
  const [picked, setPicked] = React.useState<Picked[]>([]);
  const [reading, setReading] = React.useState<null | "pdf" | "ocr">(null);
  const [error, setError] = React.useState<string | null>(null);
  const [filled, setFilled] = React.useState<string[]>([]);
  const [external, setExternal] = React.useState<{ values: FormValues; version: number } | null>(null);
  const [attach, setAttach] = React.useState(true);
  const cameraRef = React.useRef<HTMLInputElement>(null);
  const filesRef = React.useRef<HTMLInputElement>(null);
  const pdfRef = React.useRef<HTMLInputElement>(null);
  const entity = getEntity("articles");
  const labelOf = (name: string) => entity.fields.find((f) => f.name === name)?.label ?? name;

  // Libera as prévias ao sair da página.
  const pickedRef = React.useRef<Picked[]>([]);
  React.useEffect(() => {
    pickedRef.current = picked;
  }, [picked]);
  React.useEffect(() => () => pickedRef.current.forEach((p) => URL.revokeObjectURL(p.preview)), []);

  const add = async (list: FileList | null) => {
    if (!list) return;
    setError(null);
    const next: Picked[] = [];
    for (const f of Array.from(list)) {
      if (!/^image\/(png|jpe?g|webp)$/.test(f.type)) {
        toast.error(`${f.name}: envie imagens PNG, JPG ou WebP.`);
        continue;
      }
      const small = await shrinkImage(f);
      next.push({ id: newId(), file: small, preview: URL.createObjectURL(small) });
    }
    setPicked((prev) => {
      const all = [...prev, ...next];
      if (all.length > MAX_IMAGES) toast.warning(`Use até ${MAX_IMAGES} imagens por leitura.`);
      return all.slice(0, MAX_IMAGES);
    });
  };

  const apply = (article: ParsedArticle, list: string[]) => {
    const values: FormValues = {
      title: article.title,
      doi: article.doi,
      year: article.year,
      journal: article.journal,
      url: article.url,
      keywords: article.keywords,
      objective: article.abstract,
    };
    setFilled(list);
    setExternal((prev) => ({ values, version: (prev?.version ?? 0) + 1 }));
    toast.success(`${list.length} campo(s) preenchido(s). Revise antes de salvar.`);
  };

  const readPdf = async (file: File) => {
    setReading("pdf");
    setError(null);
    const fd = new FormData();
    fd.append("pdf", file, file.name);
    const res = await parseArticlePdfAction(fd);
    setReading(null);
    if (!res.ok) return setError(res.error);
    apply(res.data.article, res.data.filled);
  };

  const readPhotos = async () => {
    setReading("ocr");
    setError(null);
    try {
      const text = await ocrImages(picked.map((p) => p.file));
      const res = await parseArticleOcrTextAction(text);
      setReading(null);
      if (!res.ok) return setError(res.error);
      apply(res.data.article, res.data.filled);
    } catch {
      setReading(null);
      setError("Não consegui reconhecer o texto das imagens. Tente fotos mais nítidas e bem enquadradas.");
    }
  };

  const onCreated = React.useCallback(
    async (id: string) => {
      if (!attach || picked.length === 0) return;
      let i = 0;
      for (const p of picked) {
        i++;
        await uploadDocument(p.file, { title: `Imagem do artigo — página ${i}`, category: "artigo", attachTo: { type: "articles", id } });
      }
    },
    [attach, picked],
  );

  const busy = reading !== null;

  return (
    <div className="space-y-6">
      <Card className="border-primary/30">
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-2"><ScanText className="size-4 text-primary" /> Preencher a partir do artigo</CardTitle>
            <CardDescription>
              Envie o PDF do artigo ou tire fotos da primeira página. O sistema lê título, DOI, ano, revista, palavras-chave e resumo. Autores, método e resultados você preenche à mão, porque a leitura automática não é confiável para eles.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={busy} onClick={() => pdfRef.current?.click()}>
              {reading === "pdf" ? <Loader2 className="animate-spin" /> : <FileText />} Ler PDF
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => cameraRef.current?.click()}><Camera /> Tirar foto</Button>
            <Button variant="outline" disabled={busy} onClick={() => filesRef.current?.click()}><ImagePlus /> Escolher imagens</Button>
            <input ref={pdfRef} type="file" accept="application/pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void readPdf(f); e.target.value = ""; }} />
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { void add(e.target.files); e.target.value = ""; }} />
            <input ref={filesRef} type="file" accept="image/png,image/jpeg,image/webp" multiple className="hidden" onChange={(e) => { void add(e.target.files); e.target.value = ""; }} />
          </div>

          {picked.length > 0 && (
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {picked.map((p, i) => (
                <li key={p.id} className="relative overflow-hidden rounded-md border border-border bg-surface-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.preview} alt={`Página ${i + 1}`} className="aspect-[3/4] w-full object-cover" />
                  <span className="absolute left-1 top-1 rounded bg-black/60 px-1.5 text-[10px] font-medium text-white">{i + 1}</span>
                  <button type="button" aria-label={`Remover imagem ${i + 1}`} disabled={busy} onClick={() => { URL.revokeObjectURL(p.preview); setPicked((prev) => prev.filter((x) => x.id !== p.id)); }} className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white cursor-pointer">
                    <X className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {picked.length > 0 && (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              {mode === "create" ? (
                <label className="flex items-center gap-2 text-sm"><Checkbox checked={attach} onChange={(e) => setAttach(e.target.checked)} /> Anexar as imagens ao artigo ao salvar</label>
              ) : <span />}
              <Button onClick={readPhotos} disabled={busy}>
                {reading === "ocr" ? <Loader2 className="animate-spin" /> : <ScanText />} {reading === "ocr" ? "Reconhecendo o texto…" : `Ler ${picked.length} foto(s)`}
              </Button>
            </div>
          )}

          {error && <Alert tone="danger">{error}</Alert>}
          {filled.length > 0 && !error && (
            <Alert tone="success" title="Campos preenchidos">
              <span className="flex items-start gap-1.5"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />{filled.map(labelOf).join(", ")}. O resumo entrou no campo Objetivo. Campos que você já tinha digitado foram mantidos — confira tudo antes de salvar.</span>
            </Alert>
          )}
        </CardContent>
      </Card>

      <EntityForm
        entityKey="articles"
        mode={mode}
        recordId={recordId}
        initialValues={initialValues}
        refOptions={refOptions}
        cancelHref={cancelHref}
        externalValues={external}
        onCreated={mode === "create" ? onCreated : undefined}
      />
    </div>
  );
}
