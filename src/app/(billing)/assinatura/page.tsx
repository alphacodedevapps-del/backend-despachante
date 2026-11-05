import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { daysUntil, getAccess } from "@/lib/billing/access";
import { getBillingConfig } from "@/lib/billing/config";
import { formatDate, formatDateTime } from "@/lib/utils/format";
import { PaymentOptions, PayButton, ReturnChecker } from "@/modules/billing/components";
import { formatBRL } from "@/lib/billing/format";
import { signOutAction } from "@/modules/shell/actions";

export const metadata: Metadata = { title: "Assinatura" };

const STATUS: Record<string, { label: string; tone: "success" | "info" | "warning" | "danger" | "primary" | "neutral" }> = {
  admin: { label: "Administrador", tone: "primary" },
  ativo: { label: "Ativa", tone: "success" },
  teste: { label: "Teste grátis", tone: "info" },
  vencido: { label: "Vencida", tone: "warning" },
  bloqueado: { label: "Bloqueada", tone: "danger" },
  sem_assinatura: { label: "Sem assinatura", tone: "neutral" },
};
const PAY_STATUS: Record<string, string> = { pendente: "Pendente", pago: "Pago", recusado: "Recusado", cancelado: "Cancelado", expirado: "Expirado", estornado: "Estornado" };

export default async function SubscriptionPage({ searchParams }: { searchParams: Promise<{ retorno?: string }> }) {
  const sp = await searchParams;
  const access = await getAccess();
  const cfg = getBillingConfig();
  const supabase = await createClient();
  const [{ data: payments }, { data: sub }] = await Promise.all([
    supabase.from("payments").select("id, status, amount_cents, payment_method, paid_at, created_at, kind").order("created_at", { ascending: false }).limit(20),
    supabase.from("subscriptions").select("recurring_status").maybeSingle(),
  ]);
  const recurringActive = sub?.recurring_status === "ativa";
  const s = STATUS[access.status] ?? STATUS.sem_assinatura;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Assinatura</h1>
        <p className="text-sm text-muted-foreground">{formatBRL(access.priceCents)} por mês, com 7 dias de teste grátis. Cartão com renovação automática ou Pix avulso.</p>
      </div>

      {sp.retorno === "1" && <ReturnChecker />}

      <Card>
        <CardHeader><CardTitle>Situação</CardTitle><Badge tone={s.tone}>{s.label}</Badge></CardHeader>
        <CardContent className="space-y-3 text-sm">
          {access.status === "teste" && <p>Seu teste grátis termina em <strong>{formatDateTime(access.trialEndsAt)}</strong> ({daysUntil(access.trialEndsAt)} dia(s)).</p>}
          {access.status === "ativo" && <p>Acesso liberado até <strong>{formatDateTime(access.currentPeriodEnd)}</strong> ({daysUntil(access.currentPeriodEnd)} dia(s)). Pagar antes do vencimento soma mais 30 dias.</p>}
          {access.status === "vencido" && <p>Seu acesso terminou{access.currentPeriodEnd ? ` em ${formatDate(access.currentPeriodEnd)}` : access.trialEndsAt ? ` em ${formatDate(access.trialEndsAt)}` : ""}. Pague para liberar mais 30 dias.</p>}
          {access.status === "bloqueado" && <p>Seu acesso foi suspenso pelo administrador. Após o pagamento, entre em contato se o acesso não for liberado.</p>}
          {access.status === "admin" && <p>Contas de administrador têm acesso completo sem cobrança.</p>}
          {!cfg.configured && access.status !== "admin" && <Alert tone="warning">O pagamento online ainda está sendo ativado. Tente novamente em breve.</Alert>}
          {access.status !== "admin" && cfg.configured && (
            <div className="pt-2">
              {recurringActive ? (
                <p className="text-sm">Assinatura no cartão <strong>ativa</strong>: a renovação é automática a cada mês. Para cancelar, use o painel de assinaturas do PagBank ou fale com o suporte.</p>
              ) : access.status === "ativo" ? (
                <div className="flex flex-wrap gap-2">
                  <PayButton priceCents={access.priceCents} kind="recorrente" label={`Ativar renovação automática no cartão (${formatBRL(access.priceCents)}/mês)`} />
                  <PayButton priceCents={access.priceCents} kind="avulso" variant="outline" label={`Antecipar mais 30 dias via Pix (${formatBRL(access.priceCents)})`} />
                </div>
              ) : (
                <PaymentOptions priceCents={access.priceCents} />
              )}
            </div>
          )}
          <p className="text-xs text-muted-foreground">Pagamento processado pelo PagBank. Os dados do cartão são digitados no ambiente seguro do PagBank — não passam pelo nosso sistema.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Histórico de pagamentos</CardTitle></CardHeader>
        <CardContent>
          {(payments ?? []).length === 0 ? <p className="text-sm text-muted-foreground">Nenhum pagamento ainda.</p> : (
            <ul className="divide-y divide-border text-sm">
              {((payments ?? []) as { id: string; status: string; amount_cents: number; payment_method: string | null; paid_at: string | null; created_at: string; kind: string }[]).map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>{formatDateTime(p.paid_at ?? p.created_at)} · {formatBRL(p.amount_cents)}{p.payment_method ? ` · ${p.payment_method.replace("_", " ").toLowerCase()}` : ""}{p.kind === "recorrente" ? " · recorrente" : ""}</span>
                  <Badge tone={p.status === "pago" ? "success" : p.status === "pendente" ? "warning" : "neutral"}>{PAY_STATUS[p.status] ?? p.status}</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        {access.allowed && <Link href="/dashboard" className={buttonVariants({ variant: "outline" })}>Voltar ao sistema</Link>}
        <form action={signOutAction}><button className={buttonVariants({ variant: "ghost" })}>Sair</button></form>
      </div>
    </div>
  );
}
