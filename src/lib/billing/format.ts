/** Formata centavos em reais (R$). Puro: pode ser usado no servidor e no cliente. */
export function formatBRL(cents: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}
