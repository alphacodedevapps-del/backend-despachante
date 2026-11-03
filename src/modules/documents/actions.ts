"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/session";
import { canWrite } from "@/lib/permissions";
import { fail, friendlyDbError, type ActionResult } from "@/lib/errors";
import { LINKABLE_TYPES } from "@/modules/entities/definitions";
import { entityHref } from "@/modules/entities/links";
import { MAX_UPLOAD_BYTES, resolveMime, safeFileName, DOCUMENT_CATEGORIES } from "./constants";
import { processDocument } from "./processing";

const UUID = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const CATEGORY_VALUES = DOCUMENT_CATEGORIES.map((c) => c.value) as [string, ...string[]];

const uploadSchema = z.object({
  fileName: z.string().min(1).max(255),
  mimeType: z.string().max(200),
  size: z.number().int().positive().max(MAX_UPLOAD_BYTES, "Arquivo maior que 50 MB."),
  title: z.string().trim().min(1).max(300),
  description: z.string().max(5000).optional().nullable(),
  category: z.enum(CATEGORY_VALUES).default("material"),
  folderId: UUID.optional().nullable(),
  subjectId: UUID.optional().nullable(),
  attachTo: z.object({ type: z.string(), id: UUID }).optional().nullable(),
});

export type UploadRequest = z.input<typeof uploadSchema>;

/** Cria o registro do documento e uma URL assinada para upload direto ao Storage. */
export async function createUploadAction(input: UploadRequest): Promise<ActionResult<{ documentId: string; path: string; token: string; signedUrl: string }>> {
  const ctx = await getSessionContext();
  if (!ctx) return fail("Sessão expirada.");
  if (!canWrite(ctx.workspace.role)) return fail("Seu papel neste workspace é somente leitura.");
  const parsed = uploadSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Dados de upload inválidos.");
  const d = parsed.data;
  const mime = resolveMime(d.fileName, d.mimeType);
  if (!mime) return fail("Tipo de arquivo não permitido. Envie PDF, DOCX, PPTX, XLSX, PNG ou JPG.");
  if (d.attachTo && !(LINKABLE_TYPES as readonly string[]).includes(d.attachTo.type)) return fail("Registro de destino inválido.");

  const supabase = await createClient();
  const id = crypto.randomUUID();
  const path = `${ctx.workspace.id}/${id}/${safeFileName(d.fileName)}`;
  const { error } = await supabase.from("documents").insert({
    id,
    workspace_id: ctx.workspace.id,
    created_by: ctx.user.id,
    title: d.title,
    description: d.description ?? null,
    file_name: d.fileName.slice(0, 255),
    storage_path: path,
    mime_type: mime,
    size_bytes: d.size,
    category: mime.startsWith("image/") && d.category === "material" ? "imagem" : d.category,
    folder_id: d.folderId ?? null,
    subject_id: d.subjectId ?? null,
  });
  if (error) return fail(friendlyDbError(error));

  const { data: signed, error: signError } = await supabase.storage.from("documents").createSignedUploadUrl(path);
  if (signError || !signed) {
    await supabase.from("documents").delete().eq("id", id);
    return fail("Não foi possível preparar o envio do arquivo.");
  }
  return { ok: true, data: { documentId: id, path, token: signed.token, signedUrl: signed.signedUrl } };
}

/** Confirma o upload, vincula ao registro (se houver) e agenda a indexação. */
export async function finalizeUploadAction(documentId: string, attachTo?: { type: string; id: string } | null): Promise<ActionResult> {
  if (!UUID.safeParse(documentId).success) return fail("Documento inválido.");
  const ctx = await getSessionContext();
  if (!ctx) return fail("Sessão expirada.");
  const supabase = await createClient();

  const { data: doc } = await supabase.from("documents").select("id, workspace_id, storage_path, created_by").eq("id", documentId).maybeSingle();
  if (!doc || doc.created_by !== ctx.user.id) return fail("Documento não encontrado.");

  const folder = doc.storage_path.split("/").slice(0, -1).join("/");
  const fileName = doc.storage_path.split("/").pop();
  const { data: listed } = await supabase.storage.from("documents").list(folder, { search: fileName });
  if (!listed?.some((o) => o.name === fileName)) return fail("O arquivo não foi recebido pelo armazenamento.");

  const { error } = await supabase.from("documents").update({ upload_status: "enviado", processing_status: "aguardando" }).eq("id", documentId);
  if (error) return fail(friendlyDbError(error));

  if (attachTo && (LINKABLE_TYPES as readonly string[]).includes(attachTo.type) && UUID.safeParse(attachTo.id).success) {
    await supabase.from("entity_links").insert({
      workspace_id: doc.workspace_id,
      source_type: attachTo.type,
      source_id: attachTo.id,
      target_type: "documents",
      target_id: documentId,
      relation: "anexo",
      created_by: ctx.user.id,
    });
    revalidatePath(entityHref(attachTo.type, attachTo.id));
  }

  after(async () => {
    await processDocument(supabase, documentId, ctx.user.id);
  });

  revalidatePath("/arquivos");
  revalidatePath("/biblioteca");
  return { ok: true, data: null };
}

export async function reprocessDocumentAction(documentId: string): Promise<ActionResult> {
  if (!UUID.safeParse(documentId).success) return fail("Documento inválido.");
  const ctx = await getSessionContext();
  if (!ctx) return fail("Sessão expirada.");
  const supabase = await createClient();
  const { data, error } = await supabase.from("documents").update({ processing_status: "aguardando", processing_error: null }).eq("id", documentId).eq("upload_status", "enviado").select("id");
  if (error) return fail(friendlyDbError(error));
  if (!data?.length) return fail("Você não tem permissão para reprocessar este documento.");
  after(async () => {
    await processDocument(supabase, documentId, ctx.user.id);
  });
  revalidatePath(`/arquivos/${documentId}`);
  return { ok: true, data: null };
}

/** URL temporária (5 min) para visualizar ou baixar. A RLS do Storage valida o acesso. */
export async function getDocumentUrlAction(documentId: string, download: boolean): Promise<ActionResult<{ url: string }>> {
  if (!UUID.safeParse(documentId).success) return fail("Documento inválido.");
  const ctx = await getSessionContext();
  if (!ctx) return fail("Sessão expirada.");
  const supabase = await createClient();
  const { data: doc } = await supabase.from("documents").select("storage_path, file_name").eq("id", documentId).maybeSingle();
  if (!doc) return fail("Documento não encontrado.");
  const { data, error } = await supabase.storage.from("documents").createSignedUrl(doc.storage_path, 300, download ? { download: doc.file_name } : undefined);
  if (error || !data) return fail("Não foi possível gerar o link do arquivo.");
  return { ok: true, data: { url: data.signedUrl } };
}

/** Exclusão segura: remove o objeto do Storage, depois o registro (trechos e embeddings em cascata). */
export async function deleteDocumentAction(documentId: string): Promise<ActionResult> {
  if (!UUID.safeParse(documentId).success) return fail("Documento inválido.");
  const ctx = await getSessionContext();
  if (!ctx) return fail("Sessão expirada.");
  const supabase = await createClient();
  const { data: doc } = await supabase.from("documents").select("id, workspace_id, storage_path, title").eq("id", documentId).maybeSingle();
  if (!doc) return fail("Documento não encontrado.");

  const { error: stError } = await supabase.storage.from("documents").remove([doc.storage_path]);
  if (stError) return fail("Você não tem permissão para excluir este arquivo.");
  const { data, error } = await supabase.from("documents").delete().eq("id", documentId).select("id");
  if (error) return fail(friendlyDbError(error));
  if (!data?.length) return fail("Você não tem permissão para excluir este documento.");

  await supabase.rpc("log_workspace_event", {
    p_workspace_id: doc.workspace_id,
    p_action: "document.deleted",
    p_entity_type: "documents",
    p_entity_id: doc.id,
    p_details: { title: doc.title },
  });
  revalidatePath("/arquivos");
  revalidatePath("/biblioteca");
  return { ok: true, data: null };
}

const updateSchema = z.object({
  title: z.string().trim().min(1).max(300),
  description: z.string().max(5000).nullable(),
  category: z.enum(CATEGORY_VALUES),
  folder_id: UUID.nullable(),
  subject_id: UUID.nullable(),
  tags: z.array(z.string().trim().min(1).max(60)).max(50),
});

export async function updateDocumentAction(documentId: string, input: z.input<typeof updateSchema>): Promise<ActionResult> {
  if (!UUID.safeParse(documentId).success) return fail("Documento inválido.");
  const ctx = await getSessionContext();
  if (!ctx) return fail("Sessão expirada.");
  const parsed = updateSchema.safeParse({
    ...input,
    folder_id: input.folder_id || null,
    subject_id: input.subject_id || null,
    description: input.description || null,
  });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Dados inválidos.");
  const supabase = await createClient();
  const { data, error } = await supabase.from("documents").update(parsed.data).eq("id", documentId).select("id");
  if (error) return fail(friendlyDbError(error));
  if (!data?.length) return fail("Você não tem permissão para editar este documento.");
  revalidatePath(`/arquivos/${documentId}`);
  return { ok: true, data: null };
}

export async function toggleDocumentFavoriteAction(documentId: string, value: boolean): Promise<ActionResult> {
  if (!UUID.safeParse(documentId).success) return fail("Documento inválido.");
  const supabase = await createClient();
  const { data, error } = await supabase.from("documents").update({ is_favorite: Boolean(value) }).eq("id", documentId).select("id");
  if (error) return fail(friendlyDbError(error));
  if (!data?.length) return fail("Sem permissão.");
  revalidatePath("/arquivos");
  return { ok: true, data: null };
}
