import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBillingConfig } from "@/lib/billing/config";
import { getCheckout, getOrder, verifyWebhookSignature } from "@/lib/billing/pagbank";
import { applyOrderToPayment } from "@/lib/billing/apply";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Notificações do PagBank. Segurança em duas camadas:
 *  1. assinatura x-authenticity-token (SHA-256 de "{token}-{corpo}");
 *  2. o status NUNCA é confiado no corpo: o pedido é consultado na API do
 *     PagBank antes de liberar qualquer acesso.
 */
export async function POST(request: NextRequest) {
  const cfg = getBillingConfig();
  const admin = createAdminClient();
  if (!cfg.configured || !admin) return NextResponse.json({ error: "não configurado" }, { status: 503 });

  const raw = await request.text();
  if (raw.length > 200_000) return NextResponse.json({ error: "payload grande demais" }, { status: 413 });
  if (!verifyWebhookSignature(raw, request.headers.get("x-authenticity-token"))) {
    return NextResponse.json({ error: "assinatura inválida" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "json inválido" }, { status: 400 });
  }

  const id = typeof body.id === "string" ? body.id : "";
  const reference = typeof body.reference_id === "string" ? body.reference_id : "";
  if (!UUID.test(reference)) return NextResponse.json({ ok: true, ignored: "referência desconhecida" });

  const { data: payment } = await admin.from("payments").select("id, checkout_id").eq("id", reference).maybeSingle();
  if (!payment) return NextResponse.json({ ok: true, ignored: "pagamento não encontrado" });

  try {
    const orderIds = id.startsWith("ORDE_") ? [id] : id.startsWith("CHEC_") ? (await getCheckout(id)).orderIds : [];
    let result = "pending";
    for (const oid of orderIds) {
      const order = await getOrder(oid);
      if (order.referenceId && order.referenceId !== payment.id) continue;
      result = await applyOrderToPayment(admin, payment.id as string, order);
      if (result === "applied") break;
    }
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    // 5xx faz o PagBank reenviar a notificação mais tarde.
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
