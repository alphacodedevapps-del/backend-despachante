"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/session";
import { canWrite } from "@/lib/permissions";
import { fail, friendlyDbError, type ActionResult } from "@/lib/errors";
import { LINKABLE_TYPES } from "@/modules/entities/definitions";
import { entityHref } from "@/modules/entities/links";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TYPES = new Set<string>(LINKABLE_TYPES);

export interface SearchHit {
  type: string;
  id: string;
  title: string;
  subtitle: string | null;
  snippet: string | null;
}

export async function searchLinkTargetsAction(q: string, types: string[] | null): Promise<ActionResult<SearchHit[]>> {
  const ctx = await getSessionContext();
  if (!ctx) return fail("Sessão expirada.");
  const query = String(q ?? "").slice(0, 200);
  if (query.trim().length < 2) return { ok: true, data: [] };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("global_search", {
    p_query: query,
    p_workspace_id: ctx.workspace.id,
    p_types: types && types.length ? types.filter((t) => TYPES.has(t)) : null,
    p_limit: 30,
  });
  if (error) return fail(friendlyDbError(error));
  return {
    ok: true,
    data: ((data ?? []) as { entity_type: string; entity_id: string; title: string; subtitle: string | null; snippet: string | null }[]).map((r) => ({
      type: r.entity_type,
      id: r.entity_id,
      title: r.title,
      subtitle: r.subtitle,
      snippet: r.snippet,
    })),
  };
}

export async function addLinkAction(
  sourceType: string,
  sourceId: string,
  targetType: string,
  targetId: string,
  relation: "relacionado" | "anexo" | "referencia" | "sugerido_ia" = "relacionado",
): Promise<ActionResult> {
  if (!TYPES.has(sourceType) || !TYPES.has(targetType) || !UUID_RE.test(sourceId) || !UUID_RE.test(targetId)) {
    return fail("Relacionamento inválido.");
  }
  if (sourceType === targetType && sourceId === targetId) return fail("Um registro não pode ser relacionado a si mesmo.");
  const ctx = await getSessionContext();
  if (!ctx) return fail("Sessão expirada.");
  if (!canWrite(ctx.workspace.role)) return fail("Seu papel neste workspace é somente leitura.");

  const supabase = await createClient();
  const { error } = await supabase.from("entity_links").insert({
    workspace_id: ctx.workspace.id,
    source_type: sourceType,
    source_id: sourceId,
    target_type: targetType,
    target_id: targetId,
    relation,
    created_by: ctx.user.id,
  });
  if (error) return fail(error.code === "23505" ? "Estes registros já estão relacionados." : friendlyDbError(error));
  revalidatePath(entityHref(sourceType, sourceId));
  revalidatePath(entityHref(targetType, targetId));
  return { ok: true, data: null };
}

export async function removeLinkAction(linkId: string, pagePath: string): Promise<ActionResult> {
  if (!UUID_RE.test(linkId)) return fail("Relacionamento inválido.");
  const ctx = await getSessionContext();
  if (!ctx) return fail("Sessão expirada.");
  const supabase = await createClient();
  const { data, error } = await supabase.from("entity_links").delete().eq("id", linkId).select("id");
  if (error) return fail(friendlyDbError(error));
  if (!data?.length) return fail("Você não tem permissão para remover este relacionamento.");
  if (pagePath.startsWith("/")) revalidatePath(pagePath);
  return { ok: true, data: null };
}
