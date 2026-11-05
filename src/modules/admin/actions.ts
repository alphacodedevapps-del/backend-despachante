"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fail, type ActionResult } from "@/lib/errors";

const UUID = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

/** Confirma no banco que o usuário logado é administrador da plataforma. */
async function requireAdmin() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("is_platform_admin");
  if (data !== true) return null;
  const admin = createAdminClient();
  if (!admin) return null;
  const { data: u } = await supabase.auth.getUser();
  return { admin, actorId: u.user?.id ?? null };
}

async function audit(actorId: string | null, action: string, userId: string, details: Record<string, unknown>) {
  const admin = createAdminClient();
  await admin?.from("workspace_audit_logs").insert({ workspace_id: null, actor_id: actorId, action, entity_type: "user", entity_id: userId, details });
}

export async function setBlockedAction(userId: string, blocked: boolean, reason: string | null): Promise<ActionResult> {
  if (!UUID.safeParse(userId).success) return fail("Usuário inválido.");
  const ctx = await requireAdmin();
  if (!ctx) return fail("Acesso restrito ao administrador.");
  const { error } = await ctx.admin
    .from("subscriptions")
    .upsert({ user_id: userId, trial_ends_at: new Date().toISOString(), manually_blocked: blocked, blocked_reason: blocked ? (reason ?? "").slice(0, 500) || null : null }, { onConflict: "user_id", ignoreDuplicates: false })
    .select("user_id");
  if (error) return fail("Não foi possível atualizar o bloqueio.");
  await audit(ctx.actorId, blocked ? "admin.user_blocked" : "admin.user_unblocked", userId, { reason });
  revalidatePath("/admin");
  return { ok: true, data: null };
}

/** Concede dias de acesso (ex.: cortesia) somando ao período atual. */
export async function grantDaysAction(userId: string, days: number): Promise<ActionResult> {
  if (!UUID.safeParse(userId).success || !Number.isInteger(days) || days < 1 || days > 366) return fail("Dados inválidos.");
  const ctx = await requireAdmin();
  if (!ctx) return fail("Acesso restrito ao administrador.");
  const { data: sub } = await ctx.admin.from("subscriptions").select("current_period_end").eq("user_id", userId).maybeSingle();
  const base = Math.max(Date.now(), sub?.current_period_end ? new Date(sub.current_period_end as string).getTime() : 0);
  const end = new Date(base + days * 86400000).toISOString();
  const { error } = sub
    ? await ctx.admin.from("subscriptions").update({ current_period_end: end }).eq("user_id", userId)
    : await ctx.admin.from("subscriptions").insert({ user_id: userId, trial_ends_at: new Date().toISOString(), current_period_end: end });
  if (error) return fail("Não foi possível conceder os dias.");
  await audit(ctx.actorId, "admin.days_granted", userId, { days, until: end });
  revalidatePath("/admin");
  return { ok: true, data: null };
}

/** Registra um pagamento recebido fora do PagBank (ex.: Pix direto) e libera 30 dias. */
export async function registerManualPaymentAction(userId: string, amountCents: number): Promise<ActionResult> {
  if (!UUID.safeParse(userId).success || !Number.isInteger(amountCents) || amountCents < 1 || amountCents > 10_000_000) return fail("Dados inválidos.");
  const ctx = await requireAdmin();
  if (!ctx) return fail("Acesso restrito ao administrador.");
  const { data: pay, error } = await ctx.admin
    .from("payments")
    .insert({ user_id: userId, provider: "manual", status: "pago", amount_cents: amountCents, period_days: 30, paid_at: new Date().toISOString(), payment_method: "MANUAL", raw: { registrado_por: ctx.actorId } })
    .select("id")
    .single();
  if (error || !pay) return fail("Não foi possível registrar o pagamento.");
  const { error: applyError } = await ctx.admin.rpc("apply_payment", { p_payment_id: pay.id });
  if (applyError) return fail("Pagamento registrado, mas não aplicado.");
  await audit(ctx.actorId, "admin.manual_payment", userId, { amount_cents: amountCents });
  revalidatePath("/admin");
  return { ok: true, data: null };
}

export async function setNoteAction(userId: string, note: string): Promise<ActionResult> {
  if (!UUID.safeParse(userId).success) return fail("Usuário inválido.");
  const ctx = await requireAdmin();
  if (!ctx) return fail("Acesso restrito ao administrador.");
  const { error } = await ctx.admin.from("subscriptions").update({ admin_note: note.slice(0, 2000) || null }).eq("user_id", userId);
  if (error) return fail("Não foi possível salvar a observação.");
  revalidatePath("/admin");
  return { ok: true, data: null };
}
