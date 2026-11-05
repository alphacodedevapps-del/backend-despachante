import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { parseOrder, verifyWebhookSignature } from "@/lib/billing/pagbank";

describe("PagBank — webhook", () => {
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
