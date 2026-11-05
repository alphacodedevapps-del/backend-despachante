-- =====================================================================
-- Migration 0007: assinatura (teste grátis + períodos pagos), pagamentos
-- PagBank e administradores da plataforma.
--
-- Regras:
--   * Todo usuário novo ganha 7 dias de teste (trial_ends_at).
--   * Cada pagamento confirmado libera 30 dias a partir do maior entre
--     "agora" e o fim do período atual (pagamento antecipado acumula).
--   * Acesso liberado = admin OU (não bloqueado manualmente E
--     (agora < trial_ends_at OU agora < current_period_end)).
--   * Escritas em assinaturas/pagamentos são feitas somente pelo servidor
--     (service role: webhook do PagBank e painel do administrador).
-- =====================================================================

-- Administradores da plataforma (por e-mail, sem guardar senha)
create table public.platform_admin_emails (
  email text primary key check (email = lower(email) and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  created_at timestamptz not null default now()
);
alter table public.platform_admin_emails enable row level security;
-- Nenhuma política: inacessível pela API; usado apenas por funções SECURITY DEFINER.

insert into public.platform_admin_emails (email) values ('alphacode.devapps@gmail.com')
on conflict do nothing;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from auth.users u
      join public.platform_admin_emails a on a.email = lower(u.email)
     where u.id = auth.uid()
  );
$$;

-- Assinatura (uma por usuário)
create table public.subscriptions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  plan text not null default 'mensal' check (plan in ('mensal')),
  price_cents integer not null default 3990 check (price_cents > 0),
  trial_ends_at timestamptz not null,
  current_period_end timestamptz,
  last_payment_at timestamptz,
  manually_blocked boolean not null default false,
  blocked_reason text check (char_length(blocked_reason) <= 500),
  admin_note text check (char_length(admin_note) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index subscriptions_period_idx on public.subscriptions (current_period_end);
create trigger subscriptions_updated_at before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- Pagamentos
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null default 'pagbank' check (provider in ('pagbank', 'manual')),
  status text not null default 'pendente' check (status in ('pendente', 'pago', 'recusado', 'cancelado', 'expirado', 'estornado')),
  amount_cents integer not null check (amount_cents > 0),
  period_days integer not null default 30 check (period_days between 1 and 366),
  checkout_id text,
  order_id text,
  charge_id text,
  payment_method text,
  pay_url text check (pay_url is null or pay_url ~* '^https://'),
  paid_at timestamptz,
  applied_at timestamptz,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index payments_user_idx on public.payments (user_id, created_at desc);
create unique index payments_checkout_idx on public.payments (checkout_id) where checkout_id is not null;
create unique index payments_order_idx on public.payments (order_id) where order_id is not null;
create trigger payments_updated_at before update on public.payments
  for each row execute function public.set_updated_at();

alter table public.subscriptions enable row level security;
alter table public.payments enable row level security;

create policy subscriptions_select_own on public.subscriptions for select to authenticated
  using (user_id = auth.uid() or public.is_platform_admin());
create policy payments_select_own on public.payments for select to authenticated
  using (user_id = auth.uid() or public.is_platform_admin());
-- Sem políticas de escrita para clientes: somente o servidor (service role) grava.
revoke insert, update, delete on public.subscriptions from anon, authenticated;
revoke insert, update, delete on public.payments from anon, authenticated;

-- Teste grátis para novos usuários (encadeado ao gatilho existente de criação de usuário)
create or replace function public.tg_create_trial_subscription()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.subscriptions (user_id, trial_ends_at)
  values (new.id, now() + interval '7 days')
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created_subscription after insert on auth.users
  for each row execute function public.tg_create_trial_subscription();

-- Usuários já existentes: 7 dias a partir do cadastro (mínimo: até amanhã)
insert into public.subscriptions (user_id, trial_ends_at)
select u.id, greatest(u.created_at + interval '7 days', now() + interval '1 day')
  from auth.users u
on conflict (user_id) do nothing;

-- Situação de acesso do usuário logado
create or replace function public.my_access()
returns table (
  allowed boolean,
  status text,
  is_admin boolean,
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  price_cents integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_sub public.subscriptions;
  v_admin boolean := public.is_platform_admin();
begin
  select * into v_sub from public.subscriptions where user_id = auth.uid();
  if v_sub.user_id is null then
    return query select v_admin, case when v_admin then 'admin' else 'sem_assinatura' end, v_admin, null::timestamptz, null::timestamptz, 3990;
    return;
  end if;
  return query select
    v_admin or (not v_sub.manually_blocked and (now() < v_sub.trial_ends_at or (v_sub.current_period_end is not null and now() < v_sub.current_period_end))),
    case
      when v_admin then 'admin'
      when v_sub.manually_blocked then 'bloqueado'
      when v_sub.current_period_end is not null and now() < v_sub.current_period_end then 'ativo'
      when now() < v_sub.trial_ends_at then 'teste'
      else 'vencido'
    end,
    v_admin,
    v_sub.trial_ends_at,
    v_sub.current_period_end,
    v_sub.price_cents;
end;
$$;

-- Aplica um pagamento confirmado (idempotente). Somente service role.
create or replace function public.apply_payment(p_payment_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pay public.payments;
  v_new_end timestamptz;
begin
  select * into v_pay from public.payments where id = p_payment_id for update;
  if v_pay.id is null then
    raise exception 'Pagamento não encontrado';
  end if;
  if v_pay.status <> 'pago' then
    raise exception 'Pagamento não confirmado';
  end if;
  if v_pay.applied_at is not null then
    select current_period_end into v_new_end from public.subscriptions where user_id = v_pay.user_id;
    return v_new_end;
  end if;

  insert into public.subscriptions (user_id, trial_ends_at)
  values (v_pay.user_id, now())
  on conflict (user_id) do nothing;

  update public.subscriptions
     set current_period_end = greatest(coalesce(current_period_end, now()), now()) + make_interval(days => v_pay.period_days),
         last_payment_at = coalesce(v_pay.paid_at, now())
   where user_id = v_pay.user_id
  returning current_period_end into v_new_end;

  update public.payments set applied_at = now() where id = p_payment_id;
  return v_new_end;
end;
$$;
revoke execute on function public.apply_payment(uuid) from public, anon, authenticated;

-- Visão administrativa consolidada (somente para administradores)
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
  is_admin boolean
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
           a.email is not null
      from auth.users u
      left join public.profiles p on p.id = u.id
      left join public.subscriptions s on s.user_id = u.id
      left join public.platform_admin_emails a on a.email = lower(u.email)
     order by u.created_at desc;
end;
$$;

-- ---------------------------------------------------------------------
-- Bloqueio no banco: sem acesso ativo, o usuário não cria nem altera
-- conteúdo (as políticas de escrita usam can_write_workspace/can_edit_row).
-- ---------------------------------------------------------------------
create or replace function public.has_active_access()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_platform_admin()
      or exists (
        select 1 from public.subscriptions s
         where s.user_id = auth.uid()
           and not s.manually_blocked
           and (now() < s.trial_ends_at or (s.current_period_end is not null and now() < s.current_period_end))
      );
$$;

create or replace function public.can_write_workspace(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.workspace_role(p_workspace_id) in ('owner', 'admin', 'editor', 'member'), false)
     and public.has_active_access();
$$;

create or replace function public.can_edit_row(p_workspace_id uuid, p_created_by uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_active_access() and case public.workspace_role(p_workspace_id)
           when 'owner' then true
           when 'admin' then true
           when 'editor' then true
           when 'member' then p_created_by is not null and p_created_by = auth.uid()
           else false
         end;
$$;
