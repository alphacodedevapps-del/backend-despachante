import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { getBillingConfig } from "./config";

/**
 * Cliente mínimo da API do PagBank (Checkout + Pedidos).
 * Documentação: https://developer.pagbank.com.br/reference
 */

export interface CheckoutRequest {
  referenceId: string;
  customer?: { name?: string | null; email?: string | null };
  itemName: string;
  amountCents: number;
  redirectUrl: string;
  notificationUrl: string;
  expiresAt: Date;
}

export interface CheckoutResult {
  id: string;
  payUrl: string;
  raw: unknown;
}

export class PagBankError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "PagBankError";
  }
}

async function call(path: string, init: { method: "GET" | "POST"; body?: unknown }): Promise<Record<string, unknown>> {
  const cfg = getBillingConfig();
  if (!cfg.configured) throw new PagBankError("Pagamento ainda não configurado (PAGBANK_TOKEN ausente).");
  let res: Response;
  try {
    res = await fetch(`${cfg.apiBase}${path}`, {
      method: init.method,
      headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json", Accept: "application/json" },
      body: init.body ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
    });
  } catch {
    throw new PagBankError("Não foi possível conectar ao PagBank.");
  }
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    // resposta não-JSON
  }
  if (!res.ok) {
    const msgs = Array.isArray(json.error_messages) ? (json.error_messages as { description?: string }[]).map((e) => e.description).filter(Boolean).join("; ") : "";
    throw new PagBankError(res.status === 401 ? "Token do PagBank inválido." : `Erro do PagBank (${res.status})${msgs ? `: ${msgs}` : ""}.`, res.status);
  }
  return json;
}

export async function createCheckout(req: CheckoutRequest): Promise<CheckoutResult> {
  const customer =
    req.customer?.email || req.customer?.name
      ? { ...(req.customer.name ? { name: req.customer.name.slice(0, 120) } : {}), ...(req.customer.email ? { email: req.customer.email } : {}) }
      : undefined;
  const json = await call("/checkouts", {
    method: "POST",
    body: {
      reference_id: req.referenceId,
      expiration_date: req.expiresAt.toISOString().replace(/\.\d{3}Z$/, "-00:00"),
      ...(customer ? { customer } : {}),
      customer_modifiable: true,
      items: [{ reference_id: "assinatura-30-dias", name: req.itemName, quantity: 1, unit_amount: req.amountCents }],
      payment_methods: [{ type: "PIX" }, { type: "CREDIT_CARD" }, { type: "DEBIT_CARD" }, { type: "BOLETO" }],
      soft_descriptor: "CENTRALACAD",
      redirect_url: req.redirectUrl,
      notification_urls: [req.notificationUrl],
      payment_notification_urls: [req.notificationUrl],
    },
  });
  const links = (json.links as { rel?: string; href?: string }[] | undefined) ?? [];
  const pay = links.find((l) => l.rel === "PAY")?.href;
  if (!json.id || !pay) throw new PagBankError("O PagBank não retornou o link de pagamento.");
  return { id: String(json.id), payUrl: pay, raw: json };
}

export interface OrderStatus {
  orderId: string;
  referenceId: string | null;
  paid: boolean;
  declined: boolean;
  amountCents: number | null;
  chargeId: string | null;
  method: string | null;
  paidAt: string | null;
  raw: Record<string, unknown>;
}

/** Interpreta um pedido do PagBank (do webhook ou da consulta à API). */
export function parseOrder(order: Record<string, unknown>): OrderStatus {
  const charges = (order.charges as Record<string, unknown>[] | undefined) ?? [];
  const paidCharge = charges.find((c) => c.status === "PAID");
  const anyCharge = paidCharge ?? charges[0];
  const amount = anyCharge?.amount as { value?: number } | undefined;
  const method = anyCharge?.payment_method as { type?: string } | undefined;
  return {
    orderId: String(order.id ?? ""),
    referenceId: typeof order.reference_id === "string" ? order.reference_id : null,
    paid: Boolean(paidCharge),
    declined: !paidCharge && charges.length > 0 && charges.every((c) => c.status === "DECLINED" || c.status === "CANCELED"),
    amountCents: typeof amount?.value === "number" ? amount.value : null,
    chargeId: anyCharge?.id ? String(anyCharge.id) : null,
    method: method?.type ?? null,
    paidAt: typeof paidCharge?.paid_at === "string" ? paidCharge.paid_at : null,
    raw: order,
  };
}

/** Consulta o pedido diretamente no PagBank (fonte de verdade). */
export async function getOrder(orderId: string): Promise<OrderStatus> {
  if (!/^ORDE_[A-Za-z0-9-]{8,80}$/.test(orderId)) throw new PagBankError("Identificador de pedido inválido.");
  return parseOrder(await call(`/orders/${orderId}`, { method: "GET" }));
}

/** Consulta o checkout e os pedidos gerados a partir dele. */
export async function getCheckout(checkoutId: string): Promise<{ status: string | null; orderIds: string[] }> {
  if (!/^CHEC_[A-Za-z0-9-]{8,80}$/.test(checkoutId)) throw new PagBankError("Identificador de checkout inválido.");
  const json = await call(`/checkouts/${checkoutId}`, { method: "GET" });
  const orders = (json.orders as { id?: string }[] | undefined) ?? [];
  return { status: typeof json.status === "string" ? json.status : null, orderIds: orders.map((o) => String(o.id ?? "")).filter(Boolean) };
}

/**
 * Valida o cabeçalho x-authenticity-token enviado pelo PagBank:
 * SHA-256 de "{token}-{corpo bruto}".
 */
export function verifyWebhookSignature(rawBody: string, header: string | null, token = getBillingConfig().token): boolean {
  if (!header || !token) return false;
  const expected = createHash("sha256").update(`${token}-${rawBody}`).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(header.trim().toLowerCase(), "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}
