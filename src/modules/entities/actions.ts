"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/session";
import { canWrite } from "@/lib/permissions";
import { friendlyDbError, fail, type ActionResult } from "@/lib/errors";
import { ENTITY_MAP } from "./definitions";
import { validateEntityInput, validatePartial, type FormValues } from "./schema";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function entityOrNull(key: string) {
  return Object.prototype.hasOwnProperty.call(ENTITY_MAP, key) ? ENTITY_MAP[key] : null;
}

export async function createRecordAction(entityKey: string, raw: FormValues): Promise<ActionResult<{ id: string }>> {
  const entity = entityOrNull(entityKey);
  if (!entity) return fail("Módulo inválido.");
  const ctx = await getSessionContext();
  if (!ctx) return fail("Sua sessão expirou. Entre novamente.");
  if (!canWrite(ctx.workspace.role)) return fail("Seu papel neste workspace é somente leitura.");

  const parsed = validateEntityInput(entity, raw ?? {});
  if (!parsed.ok) return fail("Revise os campos destacados.", parsed.errors);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from(entity.key)
    .insert({ ...parsed.data, workspace_id: ctx.workspace.id, created_by: ctx.user.id })
    .select("id")
    .single();
  if (error) return fail(friendlyDbError(error));

  revalidatePath(`/${entity.slug}`);
  revalidatePath("/dashboard");
  return { ok: true, data: { id: (data as { id: string }).id } };
}

export async function updateRecordAction(entityKey: string, id: string, raw: FormValues): Promise<ActionResult<{ id: string }>> {
  const entity = entityOrNull(entityKey);
  if (!entity || !UUID_RE.test(id)) return fail("Registro inválido.");
  const ctx = await getSessionContext();
  if (!ctx) return fail("Sua sessão expirou. Entre novamente.");

  const parsed = validateEntityInput(entity, raw ?? {});
  if (!parsed.ok) return fail("Revise os campos destacados.", parsed.errors);

  const supabase = await createClient();
  const { data, error } = await supabase.from(entity.key).update(parsed.data).eq("id", id).select("id");
  if (error) return fail(friendlyDbError(error));
  if (!data || data.length === 0) return fail("Você não tem permissão para editar este registro.");

  revalidatePath(`/${entity.slug}`);
  revalidatePath(`/${entity.slug}/${id}`);
  return { ok: true, data: { id } };
}

/** Atualização parcial (status, progresso, checklists, favoritos). */
export async function patchRecordAction(entityKey: string, id: string, patch: FormValues): Promise<ActionResult> {
  const entity = entityOrNull(entityKey);
  if (!entity || !UUID_RE.test(id)) return fail("Registro inválido.");
  const ctx = await getSessionContext();
  if (!ctx) return fail("Sua sessão expirou. Entre novamente.");

  const { is_favorite, ...rest } = patch ?? {};
  const parsed = validatePartial(entity, rest);
  if (!parsed.ok) return fail(Object.values(parsed.errors)[0] ?? "Valor inválido.", parsed.errors);

  const update: FormValues = { ...parsed.data };
  if (is_favorite !== undefined) {
    if (!entity.favorites) return fail("Este módulo não possui favoritos.");
    update.is_favorite = Boolean(is_favorite);
  }
  if (entity.key === "tasks" && typeof update.status === "string") {
    update.completed_at = update.status === "concluida" ? new Date().toISOString() : null;
  }
  if (Object.keys(update).length === 0) return { ok: true, data: null };

  const supabase = await createClient();
  const { data, error } = await supabase.from(entity.key).update(update).eq("id", id).select("id");
  if (error) return fail(friendlyDbError(error));
  if (!data || data.length === 0) return fail("Você não tem permissão para alterar este registro.");

  revalidatePath(`/${entity.slug}`);
  revalidatePath(`/${entity.slug}/${id}`);
  return { ok: true, data: null };
}

export async function deleteRecordAction(entityKey: string, id: string): Promise<ActionResult> {
  const entity = entityOrNull(entityKey);
  if (!entity || !UUID_RE.test(id)) return fail("Registro inválido.");
  const ctx = await getSessionContext();
  if (!ctx) return fail("Sua sessão expirou. Entre novamente.");

  const supabase = await createClient();
  const { data, error } = await supabase.from(entity.key).delete().eq("id", id).select("id");
  if (error) return fail(friendlyDbError(error));
  if (!data || data.length === 0) return fail("Você não tem permissão para excluir este registro.");

  revalidatePath(`/${entity.slug}`);
  revalidatePath("/dashboard");
  return { ok: true, data: null };
}
