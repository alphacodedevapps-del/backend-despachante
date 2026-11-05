"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/session";
import { fail, friendlyDbError, type ActionResult } from "@/lib/errors";

export async function markNotificationReadAction(id: string | null): Promise<ActionResult> {
  const ctx = await getSessionContext();
  if (!ctx) return fail("Sessão expirada.");
  const supabase = await createClient();
  let q = supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", ctx.user.id).is("read_at", null);
  if (id) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return fail("Notificação inválida.");
    q = q.eq("id", id);
  }
  const { error } = await q;
  if (error) return fail(friendlyDbError(error));
  revalidatePath("/notificacoes");
  revalidatePath("/", "layout");
  return { ok: true, data: null };
}

export async function deleteNotificationAction(id: string): Promise<ActionResult> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return fail("Notificação inválida.");
  const supabase = await createClient();
  const { error } = await supabase.from("notifications").delete().eq("id", id);
  if (error) return fail(friendlyDbError(error));
  revalidatePath("/notificacoes");
  return { ok: true, data: null };
}
