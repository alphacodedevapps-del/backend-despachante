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
