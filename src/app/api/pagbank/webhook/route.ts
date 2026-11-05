import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBillingConfig } from "@/lib/billing/config";
import { checkWebhookSignature, getCheckout, getOrder, getRecurringSubscription, listInvoices } from "@/lib/billing/pagbank";
import { applyOrderToPayment, syncRecurringSubscription } from "@/lib/billing/apply";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Notificações do PagBank (checkout, pedidos e assinaturas recorrentes).
 * Segurança:
 *  1. assinatura x-payload-signature (ECDSA) ou x-authenticity-token (legado);
 *     assinatura presente e inválida => rejeitada;
 *  2. NADA do corpo é confiado: pedido, checkout ou assinatura são sempre
 *     consultados na API do PagBank (com nosso token) antes de liberar acesso.
 */
export async function POST(request: NextRequest) {
  const cfg = getBillingConfig();
  const admin = createAdminClient();
  if (!cfg.configured || !admin) return NextResponse.json({ error: "não configurado" }, { status: 503 });

  const raw = await request.text();
  if (raw.length > 300_000) return NextResponse.json({ error: "payload grande demais" }, { status: 413 });
  const signature = await checkWebhookSignature(raw, request.headers);
  if (signature === "invalida") return NextResponse.json({ error: "assinatura inválida" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "json inválido" }, { status: 400 });
  }

  try {
    // Eventos do Pagamento Recorrente: { event: "subscription.*", resource: { id: "SUBS_..." } }
    const event = typeof body.event === "string" ? body.event : "";
    if (event.startsWith("subscription.")) {
      const resource = (body.resource ?? {}) as { id?: string };
      const subId = typeof resource.id === "string" ? resource.id : "";
      if (!subId.startsWith("SUBS_")) return NextResponse.json({ ok: true, ignored: "sem assinatura" });
      const sub = await getRecurringSubscription(subId);
      const invoices = await listInvoices(subId);
      const r = await syncRecurringSubscription(admin, sub, invoices);
      return NextResponse.json({ ok: true, signature, ...r });
    }

    // Checkout / pedido: reference_id = id do nosso pagamento
    const id = typeof body.id === "string" ? body.id : "";
    const reference = typeof body.reference_id === "string" ? body.reference_id : "";
    if (!UUID.test(reference)) return NextResponse.json({ ok: true, ignored: "referência desconhecida" });
    const { data: payment } = await admin.from("payments").select("id").eq("id", reference).maybeSingle();
    if (!payment) return NextResponse.json({ ok: true, ignored: "pagamento não encontrado" });

    const orderIds = id.startsWith("ORDE_") ? [id] : id.startsWith("CHEC_") ? (await getCheckout(id)).orderIds : [];
    let result = "pending";
    for (const oid of orderIds) {
      const order = await getOrder(oid);
      if (order.referenceId && order.referenceId !== payment.id) continue;
      result = await applyOrderToPayment(admin, payment.id as string, order);
      if (result === "applied") break;
    }
    return NextResponse.json({ ok: true, signature, result });
  } catch (e) {
    // 5xx faz o PagBank reenviar a notificação mais tarde.
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
