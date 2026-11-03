"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/session";
import { fail, friendlyDbError, type ActionResult } from "@/lib/errors";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function setCollectionMembershipAction(articleId: string, collectionId: string, member: boolean): Promise<ActionResult> {
  if (!UUID.test(articleId) || !UUID.test(collectionId)) return fail("Dados inválidos.");
  const ctx = await getSessionContext();
  if (!ctx) return fail("Sessão expirada.");
  const supabase = await createClient();
  if (member) {
    const { data: article } = await supabase.from("articles").select("workspace_id").eq("id", articleId).maybeSingle();
    if (!article) return fail("Artigo não encontrado.");
    const { error } = await supabase
      .from("article_collection_items")
      .insert({ article_id: articleId, collection_id: collectionId, workspace_id: article.workspace_id, created_by: ctx.user.id });
    if (error && error.code !== "23505") return fail(friendlyDbError(error));
  } else {
    const { error } = await supabase.from("article_collection_items").delete().eq("article_id", articleId).eq("collection_id", collectionId);
    if (error) return fail(friendlyDbError(error));
  }
  revalidatePath(`/artigos/${articleId}`);
  revalidatePath(`/colecoes/${collectionId}`);
  return { ok: true, data: null };
}
