"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext, WORKSPACE_COOKIE } from "@/lib/session";
import { fail, friendlyDbError, type ActionResult } from "@/lib/errors";

export async function switchWorkspaceAction(workspaceId: string): Promise<ActionResult> {
  const ctx = await getSessionContext();
  if (!ctx) return fail("Sessão expirada.");
  if (!ctx.workspaces.some((w) => w.id === workspaceId)) return fail("Workspace não encontrado.");
  const store = await cookies();
  store.set(WORKSPACE_COOKIE, workspaceId, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 });
  const supabase = await createClient();
  await supabase.from("user_preferences").update({ default_workspace_id: workspaceId }).eq("user_id", ctx.user.id);
  revalidatePath("/", "layout");
  return { ok: true, data: null };
}

export async function saveThemeAction(theme: string): Promise<ActionResult> {
  if (!["light", "dark", "system"].includes(theme)) return fail("Tema inválido.");
  const ctx = await getSessionContext();
  if (!ctx) return fail("Sessão expirada.");
  const supabase = await createClient();
  const { error } = await supabase.from("user_preferences").update({ theme }).eq("user_id", ctx.user.id);
  if (error) return fail(friendlyDbError(error));
  return { ok: true, data: null };
}

export async function setSidebarCollapsedAction(collapsed: boolean): Promise<ActionResult> {
  const ctx = await getSessionContext();
  if (!ctx) return fail("Sessão expirada.");
  const supabase = await createClient();
  await supabase.from("user_preferences").update({ sidebar_collapsed: Boolean(collapsed) }).eq("user_id", ctx.user.id);
  return { ok: true, data: null };
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const store = await cookies();
  store.delete(WORKSPACE_COOKIE);
  redirect("/login");
}

export interface GlobalSearchHit {
  type: string;
  id: string;
  title: string;
  subtitle: string | null;
  snippet: string | null;
  workspace_id: string;
}

export async function globalSearchAction(q: string, allWorkspaces: boolean, types: string[] | null): Promise<ActionResult<GlobalSearchHit[]>> {
  const ctx = await getSessionContext();
  if (!ctx) return fail("Sessão expirada.");
  const query = String(q ?? "").slice(0, 200);
  if (query.trim().length < 2) return { ok: true, data: [] };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("global_search", {
    p_query: query,
    p_workspace_id: allWorkspaces ? null : ctx.workspace.id,
    p_types: types?.length ? types.slice(0, 50) : null,
    p_limit: 60,
  });
  if (error) return fail(friendlyDbError(error));
  return {
    ok: true,
    data: ((data ?? []) as { entity_type: string; entity_id: string; title: string; subtitle: string | null; snippet: string | null; workspace_id: string }[]).map((r) => ({
      type: r.entity_type,
      id: r.entity_id,
      title: r.title,
      subtitle: r.subtitle,
      snippet: r.snippet,
      workspace_id: r.workspace_id,
    })),
  };
}
