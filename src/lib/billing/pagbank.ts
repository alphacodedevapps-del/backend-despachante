import "server-only";
import { createHash, timingSafeEqual, verify as cryptoVerify } from "node:crypto";
import { getBillingConfig } from "./config";

/**
 * Cliente da API do PagBank (Checkout, Pedidos e Pagamento Recorrente).
 * Referência: https://developer.pagbank.com.br/reference
 */

export type CheckoutKind = "avulso" | "recorrente";

export interface CheckoutRequest {
  kind: CheckoutKind;
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
  planId: string | null;
  raw: unknown;
}

export class PagBankError extends Error {
  constructor(message: string, public readonly status?: number, public readonly code?: string) {
    super(message);
    this.name = "PagBankError";
  }
}

async function call(base: string, path: string, init: { method: "GET" | "POST"; body?: unknown }): Promise<Record<string, unknown>> {
  const cfg = getBillingConfig();
  if (!cfg.configured) throw new PagBankError("Pagamento ainda não configurado (PAGBANK_TOKEN ausente).");
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
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
    const errs = Array.isArray(json.error_messages) ? (json.error_messages as { error?: string; description?: string }[]) : [];
    const code = errs[0]?.error;
    if (code === "allowlist_access_required") {
      throw new PagBankError("A conta PagBank ainda não está liberada (homologação pendente) para receber pagamentos por API.", res.status, code);
    }
    const msgs = errs.map((e) => e.description).filter(Boolean).join("; ");
    throw new PagBankError(res.status === 401 ? "Token do PagBank inválido." : `Erro do PagBank (${res.status})${msgs ? `: ${msgs}` : ""}.`, res.status, code);
  }
  return json;
}

/** Monta o corpo do Checkout conforme o tipo (exportado para testes). */
export function buildCheckoutBody(req: CheckoutRequest): Record<string, unknown> {
  const customer =
    req.customer?.email || req.customer?.name
      ? { ...(req.customer.name ? { name: req.customer.name.slice(0, 120) } : {}), ...(req.customer.email ? { email: req.customer.email } : {}) }
      : undefined;
  const body: Record<string, unknown> = {
    reference_id: req.referenceId.slice(0, 64),
    expiration_date: req.expiresAt.toISOString().replace(/\.\d{3}Z$/, "-00:00"),
    ...(customer ? { customer } : {}),
    customer_modifiable: true,
    items: [{ reference_id: "assinatura-mensal", name: req.itemName.slice(0, 100), quantity: 1, unit_amount: req.amountCents }],
    soft_descriptor: "CENTRALACAD",
    redirect_url: req.redirectUrl,
    return_url: req.redirectUrl,
    notification_urls: [req.notificationUrl],
    payment_notification_urls: [req.notificationUrl],
  };
  if (req.kind === "recorrente") {
    // Checkout Recorrente: somente cartão de crédito; primeira cobrança imediata e
    // assinatura mensal automática criada pelo PagBank.
    body.payment_methods = [{ type: "CREDIT_CARD" }];
    body.payment_methods_configs = [{ type: "CREDIT_CARD", config_options: [{ option: "INSTALLMENTS_LIMIT", value: "1" }] }];
    body.recurrence_plan = { name: "Central Acadêmica — mensal", interval: { unit: "MONTH", length: 1 } };
  } else {
    body.payment_methods = [{ type: "PIX" }, { type: "CREDIT_CARD" }];
    body.payment_methods_configs = [{ type: "CREDIT_CARD", config_options: [{ option: "INSTALLMENTS_LIMIT", value: "1" }] }];
  }
  return body;
}

export async function createCheckout(req: CheckoutRequest): Promise<CheckoutResult> {
  const cfg = getBillingConfig();
  const json = await call(cfg.apiBase, "/checkouts", { method: "POST", body: buildCheckoutBody(req) });
  const links = (json.links as { rel?: string; href?: string }[] | undefined) ?? [];
  const pay = links.find((l) => l.rel === "PAY")?.href;
  if (!json.id || !pay) throw new PagBankError("O PagBank não retornou o link de pagamento.");
  const plan = json.recurrence_plan as { id?: string } | undefined;
  return { id: String(json.id), payUrl: pay, planId: plan?.id ? String(plan.id) : null, raw: json };
}

export async function inactivateCheckout(checkoutId: string): Promise<void> {
  if (!/^CHEC_[A-Za-z0-9-]{8,80}$/.test(checkoutId)) return;
  await call(getBillingConfig().apiBase, `/checkouts/${checkoutId}/inactivate`, { method: "POST", body: {} });
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
  return parseOrder(await call(getBillingConfig().apiBase, `/orders/${orderId}`, { method: "GET" }));
}

/** Consulta o checkout e os pedidos gerados a partir dele. */
export async function getCheckout(checkoutId: string): Promise<{ status: string | null; orderIds: string[]; planId: string | null }> {
  if (!/^CHEC_[A-Za-z0-9-]{8,80}$/.test(checkoutId)) throw new PagBankError("Identificador de checkout inválido.");
  const json = await call(getBillingConfig().apiBase, `/checkouts/${checkoutId}`, { method: "GET" });
  const orders = (json.orders as { id?: string }[] | undefined) ?? [];
  const plan = json.recurrence_plan as { id?: string } | undefined;
  return { status: typeof json.status === "string" ? json.status : null, orderIds: orders.map((o) => String(o.id ?? "")).filter(Boolean), planId: plan?.id ? String(plan.id) : null };
}

/* ------------------------------ Assinaturas ------------------------------ */

export interface RecurringSubscription {
  id: string;
  status: string | null;
  planId: string | null;
  customerEmail: string | null;
}

export interface Invoice {
  id: string;
  status: string | null;
  amountCents: number | null;
  occurrence: number | null;
  subscriptionId: string | null;
  updatedAt: string | null;
}

export function parseSubscription(s: Record<string, unknown>): RecurringSubscription {
  const plan = s.plan as { id?: string } | undefined;
  const customer = s.customer as { email?: string } | undefined;
  return { id: String(s.id ?? ""), status: typeof s.status === "string" ? s.status : null, planId: plan?.id ? String(plan.id) : null, customerEmail: customer?.email ? String(customer.email).toLowerCase() : null };
}

export function parseInvoice(i: Record<string, unknown>): Invoice {
  const amount = i.amount as { value?: number } | undefined;
  const sub = i.subscription as { id?: string } | undefined;
  return {
    id: String(i.id ?? ""),
    status: typeof i.status === "string" ? i.status : null,
    amountCents: typeof amount?.value === "number" ? amount.value : null,
    occurrence: typeof i.occurrence === "number" ? i.occurrence : null,
    subscriptionId: sub?.id ? String(sub.id) : null,
    updatedAt: typeof i.updated_at === "string" ? i.updated_at : null,
  };
}

export async function getRecurringSubscription(id: string): Promise<RecurringSubscription> {
  if (!/^SUBS_[A-Za-z0-9-]{8,80}$/.test(id)) throw new PagBankError("Identificador de assinatura inválido.");
  return parseSubscription(await call(getBillingConfig().subscriptionsApiBase, `/subscriptions/${id}`, { method: "GET" }));
}

export async function listInvoices(subscriptionId: string): Promise<Invoice[]> {
  if (!/^SUBS_[A-Za-z0-9-]{8,80}$/.test(subscriptionId)) throw new PagBankError("Identificador de assinatura inválido.");
  const json = await call(getBillingConfig().subscriptionsApiBase, `/subscriptions/${subscriptionId}/invoices`, { method: "GET" });
  const list = (json.invoices ?? json.data ?? []) as Record<string, unknown>[];
  return Array.isArray(list) ? list.map(parseInvoice) : [];
}

/* ------------------------- Autenticidade do webhook ------------------------- */

let cachedKey: { key: string; at: number } | null = null;

/** Chave pública de webhooks (cache de 6 h). */
async function webhookPublicKey(force = false): Promise<string | null> {
  if (!force && cachedKey && Date.now() - cachedKey.at < 6 * 3600_000) return cachedKey.key;
  try {
    const json = await call(getBillingConfig().apiBase, "/public-keys?type=webhook", { method: "GET" });
    const key = typeof json.public_key === "string" ? json.public_key : null;
    if (key) cachedKey = { key, at: Date.now() };
    return key;
  } catch {
    return cachedKey?.key ?? null;
  }
}

/** Verifica x-payload-signature (ECDSA/SHA-256, Base64; pode haver várias separadas por vírgula). */
export function verifyEcdsaSignatures(rawBody: string, header: string | null, publicKeyBase64: string): boolean {
  if (!header) return false;
  const pem = ["-----BEGIN PUBLIC KEY-----", ...(publicKeyBase64.match(/.{1,64}/g) ?? []), "-----END PUBLIC KEY-----"].join("\n");
  return header
    .replace(/^\[|\]$/g, "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .some((sig) => {
      try {
        return cryptoVerify("sha256", Buffer.from(rawBody, "utf8"), pem, Buffer.from(sig, "base64"));
      } catch {
        return false;
      }
    });
}

/** Modelo anterior: x-authenticity-token = SHA-256 de "{token}-{corpo}". */
export function verifyLegacySignature(rawBody: string, header: string | null, token = getBillingConfig().token): boolean {
  if (!header || !token) return false;
  const expected = createHash("sha256").update(`${token}-${rawBody}`).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(header.trim().toLowerCase(), "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export type SignatureCheck = "valida" | "invalida" | "ausente";

/**
 * Resultado da verificação de autenticidade. Mesmo quando "ausente" (o PagBank
 * está migrando de modelo), o webhook só altera dados após confirmar o pedido
 * ou a fatura diretamente na API do PagBank com o nosso token.
 */
export async function checkWebhookSignature(rawBody: string, headers: Headers): Promise<SignatureCheck> {
  const ecdsa = headers.get("x-payload-signature");
  const legacy = headers.get("x-authenticity-token");
  if (ecdsa) {
    const key = await webhookPublicKey();
    if (key && verifyEcdsaSignatures(rawBody, ecdsa, key)) return "valida";
    const fresh = await webhookPublicKey(true);
    if (fresh && fresh !== key && verifyEcdsaSignatures(rawBody, ecdsa, fresh)) return "valida";
    if (key || fresh) return "invalida";
  }
  if (legacy) return verifyLegacySignature(rawBody, legacy) ? "valida" : "invalida";
  return "ausente";
}
