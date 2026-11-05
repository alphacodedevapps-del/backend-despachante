"use client";

import * as React from "react";
import { toast } from "sonner";
import { Camera, CheckCircle2, ImagePlus, Loader2, ScanText, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/input";
import { EntityForm } from "@/modules/entities/components/entity-form";
import { getEntity } from "@/modules/entities/definitions";
import type { FormValues } from "@/modules/entities/schema";
import type { RefOption } from "@/modules/entities/queries";
import { uploadDocument } from "@/modules/documents/upload-client";
import { extractArticleFromImagesAction } from "./import-actions";

const MAX_IMAGES = 6;
const MAX_SIDE = 1800;

interface Picked {
  id: string;
  file: File;
  preview: string;
}

/**
 * Reduz a imagem no próprio aparelho (lado máximo 1800 px, JPEG) para
 * envio rápido e dentro dos limites, mantendo o texto legível.
 */
async function shrinkImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size < 1.5 * 1024 * 1024 && (file.type === "image/jpeg" || file.type === "image/png")) return file;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
  if (!blob) return file;
  return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
}

function newId() {
  return Math.random().toString(36).slice(2, 10);
}

export function ArticleImportForm({ mode, recordId, initialValues, refOptions, cancelHref, aiConfigured }: {
  mode: "create" | "edit";
  recordId?: string;
  initialValues: FormValues;
  refOptions: Record<string, RefOption[]>;
  cancelHref: string;
  aiConfigured: boolean;
}) {
  const [picked, setPicked] = React.useState<Picked[]>([]);
  const [reading, setReading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [filled, setFilled] = React.useState<string[]>([]);
  const [external, setExternal] = React.useState<{ values: FormValues; version: number } | null>(null);
  const [attach, setAttach] = React.useState(true);
  const cameraRef = React.useRef<HTMLInputElement>(null);
  const filesRef = React.useRef<HTMLInputElement>(null);
  const entity = getEntity("articles");
  const labelOf = (name: string) => entity.fields.find((f) => f.name === name)?.label ?? name;

  // Libera as prévias apenas ao sair da página.
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
        toast.error(`${f.name}: envie imagens PNG ou JPG.`);
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

  const read = async () => {
    setReading(true);
    setError(null);
    const fd = new FormData();
    picked.forEach((p) => fd.append("images", p.file, p.file.name));
    const res = await extractArticleFromImagesAction(fd);
    setReading(false);
    if (!res.ok) return setError(res.error);
    setFilled(res.data.filled);
    setExternal((prev) => ({ values: res.data.article as unknown as FormValues, version: (prev?.version ?? 0) + 1 }));
    toast.success(`${res.data.filled.length} campo(s) preenchido(s). Revise antes de salvar.`);
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

  return (
    <div className="space-y-6">
      <Card className="border-primary/30">
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-2"><ScanText className="size-4 text-primary" /> Preencher a partir de imagem</CardTitle>
            <CardDescription>
              Tire uma foto ou escolha imagens (PNG/JPG) das páginas do artigo — de preferência a primeira página e o resumo. A IA lê e preenche os campos; você revisa antes de salvar. Dados que não estiverem legíveis ficam em branco.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {!aiConfigured && (
            <Alert tone="warning" title="IA não configurada">
              A leitura de imagens precisa da integração de IA no servidor (variável ANTHROPIC_API_KEY ou OPENAI_API_KEY). Você ainda pode preencher o formulário manualmente.
            </Alert>
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={!aiConfigured || reading} onClick={() => cameraRef.current?.click()}><Camera /> Tirar foto</Button>
            <Button variant="outline" disabled={!aiConfigured || reading} onClick={() => filesRef.current?.click()}><ImagePlus /> Escolher imagens</Button>
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
                  <button type="button" aria-label={`Remover imagem ${i + 1}`} disabled={reading} onClick={() => { URL.revokeObjectURL(p.preview); setPicked((prev) => prev.filter((x) => x.id !== p.id)); }} className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white cursor-pointer">
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
              <Button onClick={read} disabled={!aiConfigured || reading}>
                {reading ? <Loader2 className="animate-spin" /> : <ScanText />} {reading ? "Lendo o artigo…" : `Ler ${picked.length} imagem(ns)`}
              </Button>
            </div>
          )}

          {error && <Alert tone="danger">{error}</Alert>}
          {filled.length > 0 && !error && (
            <Alert tone="success" title="Campos preenchidos pela IA">
              <span className="flex items-start gap-1.5"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />{filled.map(labelOf).join(", ")}. Campos que você já tinha digitado foram mantidos. Confira tudo — especialmente autores, ano e DOI — antes de salvar.</span>
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
