-- =====================================================================
-- Migration 0008: cartão de crédito recorrente (Checkout Recorrente do
-- PagBank) além do Pix/cartão avulso de 30 dias.
-- =====================================================================

alter table public.payments
  add column if not exists kind text not null default 'avulso' check (kind in ('avulso', 'recorrente')),
  add column if not exists plan_id text,
  add column if not exists subscription_ref text;
create index if not exists payments_plan_idx on public.payments (plan_id) where plan_id is not null;

alter table public.subscriptions
  add column if not exists pagbank_subscription_id text,
  add column if not exists recurring_status text check (recurring_status is null or recurring_status in ('ativa', 'suspensa', 'cancelada', 'expirada', 'pendente'));
create unique index if not exists subscriptions_pagbank_sub_idx on public.subscriptions (pagbank_subscription_id) where pagbank_subscription_id is not null;

-- Visão administrativa com a forma de cobrança
drop function if exists public.admin_list_users();
create or replace function public.admin_list_users()
returns table (
  user_id uuid,
  email text,
  full_name text,
  signed_up_at timestamptz,
  last_sign_in_at timestamptz,
  email_confirmed boolean,
  status text,
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  last_payment_at timestamptz,
  manually_blocked boolean,
  blocked_reason text,
  admin_note text,
  total_paid_cents bigint,
  payments_count bigint,
  is_admin boolean,
  recurring_status text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Acesso restrito ao administrador' using errcode = '42501';
  end if;
  return query
    select u.id, u.email::text, p.full_name, u.created_at, u.last_sign_in_at, u.email_confirmed_at is not null,
           case
             when a.email is not null then 'admin'
             when s.manually_blocked then 'bloqueado'
             when s.current_period_end is not null and now() < s.current_period_end then 'ativo'
             when s.trial_ends_at is not null and now() < s.trial_ends_at then 'teste'
             else 'vencido'
           end,
           s.trial_ends_at, s.current_period_end, s.last_payment_at, coalesce(s.manually_blocked, false), s.blocked_reason, s.admin_note,
           coalesce((select sum(x.amount_cents) from public.payments x where x.user_id = u.id and x.status = 'pago'), 0)::bigint,
           (select count(*) from public.payments x where x.user_id = u.id and x.status = 'pago'),
           a.email is not null,
           s.recurring_status
      from auth.users u
      left join public.profiles p on p.id = u.id
      left join public.subscriptions s on s.user_id = u.id
      left join public.platform_admin_emails a on a.email = lower(u.email)
     order by u.created_at desc;
end;
$$;
