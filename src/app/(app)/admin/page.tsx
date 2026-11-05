import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Search } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { StatTile } from "@/components/dashboard/widgets";
import { requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { getAccess } from "@/lib/billing/access";
import { getBillingConfig } from "@/lib/billing/config";
import { formatDate, formatDateTime } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import { formatBRL } from "@/lib/billing/format";
import { UserActions } from "@/modules/admin/user-actions";

export const metadata: Metadata = { title: "Painel do administrador" };

interface AdminUser {
  user_id: string;
  email: string;
  full_name: string | null;
  signed_up_at: string;
  last_sign_in_at: string | null;
  email_confirmed: boolean;
  status: "admin" | "ativo" | "teste" | "vencido" | "bloqueado";
  trial_ends_at: string | null;
  current_period_end: string | null;
  last_payment_at: string | null;
  manually_blocked: boolean;
  blocked_reason: string | null;
  admin_note: string | null;
  total_paid_cents: number;
  payments_count: number;
  is_admin: boolean;
}

const STATUS = {
  admin: { label: "Admin", tone: "primary" },
  ativo: { label: "Ativo (pago)", tone: "success" },
  teste: { label: "Em teste", tone: "info" },
  vencido: { label: "Vencido", tone: "warning" },
  bloqueado: { label: "Bloqueado", tone: "danger" },
} as const;

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  await requireSession();
  const access = await getAccess();
  if (!access.isAdmin) notFound();
  const sp = await searchParams;
  const supabase = await createClient();
  const cfg = getBillingConfig();

  const [{ data: usersRaw }, { data: paymentsRaw }] = await Promise.all([
    supabase.rpc("admin_list_users"),
    supabase.from("payments").select("id, user_id, status, amount_cents, provider, payment_method, paid_at, created_at").order("created_at", { ascending: false }).limit(50),
  ]);
  const users = (usersRaw ?? []) as AdminUser[];
  const payments = (paymentsRaw ?? []) as { id: string; user_id: string; status: string; amount_cents: number; provider: string; payment_method: string | null; paid_at: string | null; created_at: string }[];
  const emailOf = new Map(users.map((u) => [u.user_id, u.email]));

  const counts = { total: users.filter((u) => !u.is_admin).length, ativo: 0, teste: 0, vencido: 0, bloqueado: 0 };
  for (const u of users) if (u.status in counts && !u.is_admin) counts[u.status as "ativo"]++;
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const paidAll = payments.filter((p) => p.status === "pago");
  const revenueMonth = paidAll.filter((p) => p.paid_at && new Date(p.paid_at) >= monthStart).reduce((s, p) => s + p.amount_cents, 0);
  const revenueTotal = users.reduce((s, u) => s + Number(u.total_paid_cents), 0);

  const q = (sp.q ?? "").trim().toLowerCase();
  const filtered = users.filter((u) => (!sp.status || u.status === sp.status) && (!q || u.email.toLowerCase().includes(q) || (u.full_name ?? "").toLowerCase().includes(q)));
  const chip = (value: string | undefined, label: string, n?: number) => (
    <Link href={`/admin${value ? `?status=${value}` : ""}`} className={cn("rounded-full border px-3 py-1 text-sm", sp.status === value ? "border-primary bg-primary-soft text-primary" : "border-border")}>
      {label}{n !== undefined ? ` (${n})` : ""}
    </Link>
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Painel do administrador" description="Quem está usando, quem está ativo, em teste, vencido ou bloqueado, e os pagamentos recebidos." icon="ShieldCheck" />
      {!cfg.configured && <Alert tone="warning" title="Pagamento online ainda não ativado">Defina PAGBANK_TOKEN (e PAGBANK_ENV=production quando for cobrar de verdade) nas variáveis da Netlify. Enquanto isso, você pode registrar pagamentos manuais e conceder dias.</Alert>}

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatTile label="Alunos cadastrados" value={counts.total} icon="Users" href="/admin" />
        <StatTile label="Ativos (pagos)" value={counts.ativo} icon="ShieldCheck" href="/admin?status=ativo" />
        <StatTile label="Em teste" value={counts.teste} icon="Timer" href="/admin?status=teste" />
        <StatTile label="Vencidos" value={counts.vencido} icon="Clock" href="/admin?status=vencido" />
        <StatTile label="Bloqueados" value={counts.bloqueado} icon="Ban" href="/admin?status=bloqueado" />
        <StatTile label="Receita no mês" value={formatBRL(revenueMonth)} icon="Wallet" href="/admin" hint={`Total: ${formatBRL(revenueTotal)}`} />
      </section>

      <Card>
        <CardHeader><CardTitle>Usuários</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-2">
              {chip(undefined, "Todos")}
              {chip("ativo", "Ativos", counts.ativo)}
              {chip("teste", "Em teste", counts.teste)}
              {chip("vencido", "Vencidos", counts.vencido)}
              {chip("bloqueado", "Bloqueados", counts.bloqueado)}
            </div>
            <form action="/admin" className="relative">
              {sp.status && <input type="hidden" name="status" value={sp.status} />}
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input name="q" defaultValue={sp.q ?? ""} placeholder="Buscar nome ou e-mail" className="h-9 w-full rounded-md border border-input bg-surface pl-9 pr-3 text-sm lg:w-72" aria-label="Buscar usuário" />
            </form>
          </div>

          <div className="hidden overflow-x-auto rounded-lg border border-border md:block">
            <table className="w-full text-sm">
              <thead className="bg-surface-muted/60 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Usuário</th>
                  <th className="px-3 py-2">Situação</th>
                  <th className="px-3 py-2">Acesso até</th>
                  <th className="px-3 py-2">Último pagamento</th>
                  <th className="px-3 py-2">Total pago</th>
                  <th className="px-3 py-2">Último acesso</th>
                  <th className="px-3 py-2"><span className="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((u) => {
                  const st = STATUS[u.status];
                  const until = u.status === "teste" ? u.trial_ends_at : u.current_period_end ?? u.trial_ends_at;
                  return (
                    <tr key={u.user_id} className="align-top">
                      <td className="px-3 py-2">
                        <p className="font-medium">{u.full_name || "—"}</p>
                        <p className="text-xs text-muted-foreground">{u.email}{!u.email_confirmed && " · e-mail não confirmado"}</p>
                        <p className="text-xs text-muted-foreground">Cadastro: {formatDate(u.signed_up_at)}</p>
                        {u.admin_note && <p className="mt-1 text-xs italic text-muted-foreground">Obs.: {u.admin_note}</p>}
                      </td>
                      <td className="px-3 py-2"><Badge tone={st.tone}>{st.label}</Badge>{u.manually_blocked && u.blocked_reason && <p className="mt-1 text-xs text-muted-foreground">{u.blocked_reason}</p>}</td>
                      <td className="px-3 py-2 tabular-nums">{u.is_admin ? "—" : formatDate(until)}</td>
                      <td className="px-3 py-2 tabular-nums">{formatDate(u.last_payment_at) || "—"}</td>
                      <td className="px-3 py-2 tabular-nums">{formatBRL(Number(u.total_paid_cents))} <span className="text-xs text-muted-foreground">({u.payments_count})</span></td>
                      <td className="px-3 py-2 tabular-nums text-xs">{formatDateTime(u.last_sign_in_at) || "—"}</td>
                      <td className="px-3 py-2 text-right"><UserActions userId={u.user_id} email={u.email} blocked={u.manually_blocked} note={u.admin_note} priceCents={cfg.priceCents} isAdmin={u.is_admin} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <ul className="space-y-2 md:hidden">
            {filtered.map((u) => (
              <li key={u.user_id} className="flex items-start justify-between gap-2 rounded-lg border border-border p-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{u.full_name || u.email}</p>
                  <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs"><Badge tone={STATUS[u.status].tone}>{STATUS[u.status].label}</Badge> até {formatDate(u.status === "teste" ? u.trial_ends_at : u.current_period_end ?? u.trial_ends_at) || "—"}</div>
                </div>
                <UserActions userId={u.user_id} email={u.email} blocked={u.manually_blocked} note={u.admin_note} priceCents={cfg.priceCents} isAdmin={u.is_admin} />
              </li>
            ))}
          </ul>
          {filtered.length === 0 && <p className="text-sm text-muted-foreground">Nenhum usuário encontrado.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Pagamentos recentes</CardTitle></CardHeader>
        <CardContent>
          {payments.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum pagamento ainda.</p> : (
            <ul className="divide-y divide-border text-sm">
              {payments.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="min-w-0 truncate">{emailOf.get(p.user_id) ?? "Usuário removido"} · {formatBRL(p.amount_cents)} · {p.provider === "manual" ? "manual" : (p.payment_method ?? "PagBank").replace("_", " ").toLowerCase()}</span>
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">{formatDateTime(p.paid_at ?? p.created_at)} <Badge tone={p.status === "pago" ? "success" : p.status === "pendente" ? "warning" : "neutral"}>{p.status}</Badge></span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">Para adicionar outro administrador, inclua o e-mail na tabela <code>platform_admin_emails</code> do Supabase. <Link href="/assinatura" className={buttonVariants({ variant: "link", size: "sm" })}>Ver página de assinatura</Link></p>
    </div>
  );
}
