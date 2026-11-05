import "server-only";

/** Configuração de cobrança (somente servidor). */
export function getBillingConfig() {
  const env = (process.env.PAGBANK_ENV ?? "sandbox").toLowerCase() === "production" ? "production" : "sandbox";
  const num = (v: string | undefined, d: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : d;
  };
  return {
    env,
    token: process.env.PAGBANK_TOKEN ?? "",
    configured: Boolean(process.env.PAGBANK_TOKEN),
    apiBase: env === "production" ? "https://api.pagseguro.com" : "https://sandbox.api.pagseguro.com",
    subscriptionsApiBase: env === "production" ? "https://api.assinaturas.pagseguro.com" : "https://sandbox.api.assinaturas.pagseguro.com",
    priceCents: num(process.env.SUBSCRIPTION_PRICE_CENTS, 3990),
    periodDays: num(process.env.SUBSCRIPTION_PERIOD_DAYS, 30),
    trialDays: 7,
  };
}
