"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/supabase/env";
import { fail, type ActionResult } from "@/lib/errors";
import { getBillingConfig } from "@/lib/billing/config";
import { createCheckout, getCheckout, getOrder, PagBankError } from "@/lib/billing/pagbank";
import { applyOrderToPayment } from "@/lib/billing/apply";

/** Cria um checkout PagBank de 30 dias e devolve o link de pagamento. */
export async function startCheckoutAction(): Promise<ActionResult<{ payUrl: string }>> {
  const ctx = await getSessionContext();
  if (!ctx) return fail("Sessão expirada. Entre novamente.");
  const cfg = getBillingConfig();
  if (!cfg.configured) return fail("O pagamento ainda não foi ativado pelo administrador. Tente novamente mais tarde.");
  const admin = createAdminClient();
  if (!admin) return fail("Servidor sem SUPABASE_SERVICE_ROLE_KEY configurada.");

  // Reaproveita um checkout pendente criado há menos de 1 hora.
  const { data: pending } = await admin
    .from("payments")
    .select("id, pay_url, created_at")
    .eq("user_id", ctx.user.id)
    .eq("status", "pendente")
    .gte("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString())
    .not("pay_url", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (pending?.pay_url) return { ok: true, data: { payUrl: pending.pay_url as string } };

  const { data: payment, error } = await admin
    .from("payments")
    .insert({ user_id: ctx.user.id, provider: "pagbank", status: "pendente", amount_cents: cfg.priceCents, period_days: cfg.periodDays })
    .select("id")
    .single();
  if (error || !payment) return fail("Não foi possível iniciar o pagamento.");

  try {
    const checkout = await createCheckout({
      referenceId: payment.id as string,
      customer: { name: ctx.profile?.full_name ?? null, email: ctx.user.email || null },
      itemName: `Central Acadêmica — acesso por ${cfg.periodDays} dias`,
      amountCents: cfg.priceCents,
      redirectUrl: `${siteUrl()}/assinatura?retorno=1`,
      notificationUrl: `${siteUrl()}/api/pagbank/webhook`,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
    await admin.from("payments").update({ checkout_id: checkout.id, pay_url: checkout.payUrl, raw: { checkout: checkout.raw } }).eq("id", payment.id);
    return { ok: true, data: { payUrl: checkout.payUrl } };
  } catch (e) {
    await admin.from("payments").update({ status: "cancelado", raw: { error: (e as Error).message } }).eq("id", payment.id);
    return fail(e instanceof PagBankError ? e.message : "Falha ao criar o pagamento.");
  }
}

/** Consulta no PagBank os pagamentos pendentes do usuário (útil logo após voltar do checkout). */
export async function refreshMyPaymentsAction(): Promise<ActionResult<{ activated: boolean }>> {
  const ctx = await getSessionContext();
  if (!ctx) return fail("Sessão expirada.");
  const admin = createAdminClient();
  if (!admin || !getBillingConfig().configured) return { ok: true, data: { activated: false } };
  const { data } = await admin.from("payments").select("id, checkout_id, order_id").eq("user_id", ctx.user.id).eq("status", "pendente").not("checkout_id", "is", null).limit(5);
  let activated = false;
  for (const p of (data ?? []) as { id: string; checkout_id: string; order_id: string | null }[]) {
    try {
      const orderIds = p.order_id ? [p.order_id] : (await getCheckout(p.checkout_id)).orderIds;
      for (const oid of orderIds) {
        const order = await getOrder(oid);
        if (order.referenceId && order.referenceId !== p.id) continue;
        const r = await applyOrderToPayment(admin, p.id, order);
        activated = activated || r === "applied";
      }
    } catch {
      // segue para o próximo; o webhook também confirmará
    }
  }
  if (activated) revalidatePath("/", "layout");
  return { ok: true, data: { activated } };
}

/** Status atual (para a tela de assinatura atualizar após o retorno). */
export async function myAccessStatusAction(): Promise<ActionResult<{ allowed: boolean; status: string }>> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_access");
  const row = (Array.isArray(data) ? data[0] : data) as { allowed: boolean; status: string } | undefined;
  return { ok: true, data: { allowed: Boolean(row?.allowed), status: row?.status ?? "sem_assinatura" } };
}
