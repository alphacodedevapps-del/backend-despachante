"use client";

import { createUploadAction, finalizeUploadAction } from "./actions";

/** Envia o arquivo via XHR para acompanhar o progresso real. */
export function putWithProgress(url: string, file: Blob, onProgress?: (p: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (anon) xhr.setRequestHeader("apikey", anon);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Falha no envio (${xhr.status}).`)));
    xhr.onerror = () => reject(new Error("Erro de rede durante o envio."));
    const body = new FormData();
    body.append("cacheControl", "3600");
    body.append("", file);
    xhr.send(body);
  });
}

/** Cria o documento, envia ao Storage e (opcionalmente) anexa a um registro. */
export async function uploadDocument(
  file: File,
  opts: { title: string; category?: string; attachTo?: { type: string; id: string } | null; folderId?: string | null; subjectId?: string | null },
  onProgress?: (p: number) => void,
): Promise<string> {
  const res = await createUploadAction({
    fileName: file.name,
    mimeType: file.type,
    size: file.size,
    title: opts.title,
    category: opts.category ?? "material",
    folderId: opts.folderId ?? null,
    subjectId: opts.subjectId ?? null,
    attachTo: opts.attachTo ?? null,
  });
  if (!res.ok) throw new Error(res.error);
  await putWithProgress(res.data.signedUrl, file, onProgress);
  const fin = await finalizeUploadAction(res.data.documentId, opts.attachTo ?? null);
  if (!fin.ok) throw new Error(fin.error);
  return res.data.documentId;
}
