import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrderStatus } from "./pagbank";

/**
 * Atualiza o pagamento a partir de um pedido CONFIRMADO NA API do PagBank e,
 * se pago com o valor correto, libera o período (idempotente).
 */
export async function applyOrderToPayment(admin: SupabaseClient, paymentId: string, order: OrderStatus): Promise<"applied" | "pending" | "declined" | "mismatch"> {
  const { data: pay } = await admin.from("payments").select("id, amount_cents, status, applied_at").eq("id", paymentId).maybeSingle();
  if (!pay) return "mismatch";
  if (order.paid) {
    if (order.amountCents !== null && order.amountCents < (pay.amount_cents as number)) {
      await admin.from("payments").update({ raw: { order: order.raw, alerta: "valor pago menor que o esperado" } }).eq("id", paymentId);
      return "mismatch";
    }
    await admin
      .from("payments")
      .update({ status: "pago", order_id: order.orderId, charge_id: order.chargeId, payment_method: order.method, paid_at: order.paidAt ?? new Date().toISOString(), raw: { order: order.raw } })
      .eq("id", paymentId);
    const { error } = await admin.rpc("apply_payment", { p_payment_id: paymentId });
    return error ? "pending" : "applied";
  }
  if (order.declined && pay.status === "pendente") {
    await admin.from("payments").update({ status: "recusado", order_id: order.orderId, raw: { order: order.raw } }).eq("id", paymentId);
    return "declined";
  }
  if (!pay.applied_at) await admin.from("payments").update({ order_id: order.orderId }).eq("id", paymentId);
  return "pending";
}

const RECURRING_STATUS: Record<string, "ativa" | "suspensa" | "cancelada" | "expirada" | "pendente"> = {
  ACTIVE: "ativa",
  TRIAL: "ativa",
  OVERDUE: "pendente",
  PENDING: "pendente",
  PENDING_ACTION: "pendente",
  SUSPENDED: "suspensa",
  CANCELED: "cancelada",
  EXPIRED: "expirada",
};

/**
 * Sincroniza uma assinatura recorrente do PagBank (consultada na API):
 * vincula ao usuário, atualiza o status e credita 30 dias por fatura paga
 * de renovação (a 1ª fatura corresponde ao pedido do checkout, já creditado).
 */
export async function syncRecurringSubscription(
  admin: SupabaseClient,
  sub: { id: string; status: string | null; planId: string | null; customerEmail: string | null },
  invoices: { id: string; status: string | null; amountCents: number | null; occurrence: number | null; updatedAt: string | null }[],
): Promise<{ userId: string | null; credited: number }> {
  let userId: string | null = null;
  const { data: bySub } = await admin.from("subscriptions").select("user_id").eq("pagbank_subscription_id", sub.id).maybeSingle();
  userId = (bySub?.user_id as string | undefined) ?? null;
  if (!userId && sub.planId) {
    const { data: byPlan } = await admin.from("payments").select("user_id").eq("plan_id", sub.planId).limit(1).maybeSingle();
    userId = (byPlan?.user_id as string | undefined) ?? null;
  }
  if (!userId) return { userId: null, credited: 0 };

  await admin
    .from("subscriptions")
    .update({ pagbank_subscription_id: sub.id, recurring_status: sub.status ? (RECURRING_STATUS[sub.status] ?? null) : null })
    .eq("user_id", userId);

  let credited = 0;
  for (const inv of invoices) {
    if (inv.status !== "PAID" || (inv.occurrence !== null && inv.occurrence <= 1)) continue;
    const { data: exists } = await admin.from("payments").select("id").eq("order_id", inv.id).maybeSingle();
    if (exists) continue;
    const { data: pay } = await admin
      .from("payments")
      .insert({
        user_id: userId,
        provider: "pagbank",
        kind: "recorrente",
        status: "pago",
        amount_cents: inv.amountCents ?? 3990,
        period_days: 30,
        order_id: inv.id,
        subscription_ref: sub.id,
        plan_id: sub.planId,
        payment_method: "CREDIT_CARD",
        paid_at: inv.updatedAt ?? new Date().toISOString(),
        raw: { invoice: inv },
      })
      .select("id")
      .single();
    if (pay) {
      const { error } = await admin.rpc("apply_payment", { p_payment_id: pay.id });
      if (!error) credited++;
    }
  }
  return { userId, credited };
}
