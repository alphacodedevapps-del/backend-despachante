import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { generateKeyPairSync, sign } from "node:crypto";
import { buildCheckoutBody, parseInvoice, parseOrder, verifyEcdsaSignatures, verifyLegacySignature as verifyWebhookSignature } from "@/lib/billing/pagbank";

describe("PagBank — webhook (modelo anterior)", () => {
  const token = "token-de-teste";
  const body = JSON.stringify({ id: "ORDE_123", reference_id: "abc" });
  const sig = createHash("sha256").update(`${token}-${body}`).digest("hex");

  it("aceita somente a assinatura correta (SHA-256 de token-corpo)", () => {
    expect(verifyWebhookSignature(body, sig, token)).toBe(true);
    expect(verifyWebhookSignature(body, sig.toUpperCase(), token)).toBe(true);
    expect(verifyWebhookSignature(body + " ", sig, token)).toBe(false);
    expect(verifyWebhookSignature(body, "00" + sig.slice(2), token)).toBe(false);
    expect(verifyWebhookSignature(body, null, token)).toBe(false);
    expect(verifyWebhookSignature(body, sig, "")).toBe(false);
  });
});

describe("PagBank — interpretação do pedido", () => {
  it("identifica pagamento confirmado", () => {
    const o = parseOrder({ id: "ORDE_1", reference_id: "r1", charges: [{ id: "CHAR_1", status: "PAID", amount: { value: 3990 }, payment_method: { type: "PIX" }, paid_at: "2026-11-05T10:00:00-03:00" }] });
    expect(o).toMatchObject({ orderId: "ORDE_1", referenceId: "r1", paid: true, declined: false, amountCents: 3990, method: "PIX", chargeId: "CHAR_1" });
  });
  it("pedido recusado não libera acesso", () => {
    const o = parseOrder({ id: "ORDE_2", charges: [{ id: "CHAR_2", status: "DECLINED", amount: { value: 3990 } }] });
    expect(o.paid).toBe(false);
    expect(o.declined).toBe(true);
  });
  it("pedido sem cobrança fica pendente", () => {
    const o = parseOrder({ id: "ORDE_3", charges: [] });
    expect(o.paid).toBe(false);
    expect(o.declined).toBe(false);
  });
});

describe("PagBank — webhook (ECDSA x-payload-signature)", () => {
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const pubB64 = publicKey.export({ type: "spki", format: "der" }).toString("base64");
  const body = '{"id":"ORDE_1","reference_id":"x"}';
  const good = sign("sha256", Buffer.from(body), privateKey).toString("base64");
  it("valida assinatura correta, inclusive entre várias", () => {
    expect(verifyEcdsaSignatures(body, good, pubB64)).toBe(true);
    expect(verifyEcdsaSignatures(body, `lixo==, ${good}`, pubB64)).toBe(true);
  });
  it("rejeita corpo alterado, assinatura ausente ou inválida", () => {
    expect(verifyEcdsaSignatures(body + " ", good, pubB64)).toBe(false);
    expect(verifyEcdsaSignatures(body, null, pubB64)).toBe(false);
    expect(verifyEcdsaSignatures(body, "AAAA", pubB64)).toBe(false);
  });
});

describe("PagBank — corpo do checkout", () => {
  const base = { referenceId: "ref", itemName: "Central", amountCents: 3990, redirectUrl: "https://x.app/assinatura", notificationUrl: "https://x.app/api/pagbank/webhook", expiresAt: new Date("2026-11-06T12:00:00Z"), customer: { email: "a@b.com" } };
  it("avulso: R$ 39,90 com Pix e cartão, sem recorrência", () => {
    const b = buildCheckoutBody({ ...base, kind: "avulso" });
    expect((b.items as { unit_amount: number }[])[0].unit_amount).toBe(3990);
    expect((b.payment_methods as { type: string }[]).map((m) => m.type)).toEqual(["PIX", "CREDIT_CARD"]);
    expect(b.recurrence_plan).toBeUndefined();
    expect(b.notification_urls).toEqual(["https://x.app/api/pagbank/webhook"]);
  });
  it("recorrente: somente cartão de crédito com plano mensal", () => {
    const b = buildCheckoutBody({ ...base, kind: "recorrente" });
    expect((b.payment_methods as { type: string }[]).map((m) => m.type)).toEqual(["CREDIT_CARD"]);
    expect(b.recurrence_plan).toEqual({ name: "Central Acadêmica — mensal", interval: { unit: "MONTH", length: 1 } });
    expect((b.items as { unit_amount: number }[])[0].unit_amount).toBe(3990);
  });
});

describe("PagBank — faturas da assinatura", () => {
  it("interpreta fatura paga", () => {
    expect(parseInvoice({ id: "INVO_1", status: "PAID", amount: { value: 3990 }, occurrence: 2, subscription: { id: "SUBS_1" } })).toMatchObject({ id: "INVO_1", status: "PAID", amountCents: 3990, occurrence: 2, subscriptionId: "SUBS_1" });
  });
});
