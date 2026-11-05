-- ============================================================
-- Central Acadêmica — instalação completa do banco (Supabase)
-- Cole TODO este arquivo no SQL Editor do Supabase e clique em Run.
-- Gerado a partir de supabase/migrations/ (mesma ordem).
-- ============================================================

-- >>> supabase/migrations/20260101000001_core.sql
-- =====================================================================
-- Central Acadêmica — Fisioterapia
-- Migration 0001: núcleo (perfis, preferências, workspaces, papéis,
-- autorização, relacionamentos genéricos, índice de busca, auditoria,
-- notificações).
-- =====================================================================

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;

-- ---------------------------------------------------------------------
-- Utilitários
-- ---------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Impede que o autor ou o workspace de um registro sejam alterados após a criação.
create or replace function public.protect_ownership()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.created_by := old.created_by;
  new.workspace_id := old.workspace_id;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.try_uuid(p text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return p::uuid;
exception when others then
  return null;
end;
$$;

-- Normaliza texto para busca (minúsculas, sem acentos). Marcada IMMUTABLE usando
-- a forma com dicionário explícito do unaccent, para permitir uso em índices.
create or replace function public.normalize_search(p text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(p, '')));
$$;

-- Constrói uma tsquery de prefixo segura a partir de texto livre do usuário.
create or replace function public.build_prefix_tsquery(p_query text)
returns tsquery
language plpgsql
stable
set search_path = ''
as $$
declare
  v_terms text[];
  v_query text;
begin
  select array_agg(t)
    into v_terms
    from (
      select regexp_replace(w, '[^[:alnum:]]', '', 'g') as t
        from regexp_split_to_table(public.normalize_search(p_query), '\s+') as w
    ) s
   where length(t) > 0;

  if v_terms is null or array_length(v_terms, 1) is null then
    return null;
  end if;

  select string_agg(t || ':*', ' & ') into v_query from unnest(v_terms[1:12]) as t;
  return to_tsquery('simple', v_query);
end;
$$;

-- ---------------------------------------------------------------------
-- Perfis e preferências
-- ---------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text check (char_length(full_name) <= 160),
  avatar_path text,
  institution text check (char_length(institution) <= 200),
  course text not null default 'Fisioterapia' check (char_length(course) <= 120),
  current_period text check (char_length(current_period) <= 40),
  city text check (char_length(city) <= 120),
  bio text check (char_length(bio) <= 2000),
  lattes_url text check (lattes_url is null or lattes_url ~* '^https?://'),
  linkedin_url text check (linkedin_url is null or linkedin_url ~* '^https?://'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Workspaces
-- ---------------------------------------------------------------------

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  description text check (char_length(description) <= 1000),
  workspace_type text not null default 'grupo_estudos'
    check (workspace_type in ('pessoal', 'grupo_estudos', 'liga', 'projeto', 'institucional')),
  is_personal boolean not null default false,
  owner_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspaces_personal_type check (not is_personal or workspace_type = 'pessoal')
);

create unique index workspaces_one_personal_per_user on public.workspaces (owner_id) where is_personal;
create index workspaces_owner_idx on public.workspaces (owner_id);

create trigger workspaces_updated_at before update on public.workspaces
  for each row execute function public.set_updated_at();

create table public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'editor', 'member', 'viewer')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);

create index workspace_members_user_idx on public.workspace_members (user_id);
create unique index workspace_members_one_owner on public.workspace_members (workspace_id) where role = 'owner';

create trigger workspace_members_updated_at before update on public.workspace_members
  for each row execute function public.set_updated_at();

create table public.workspace_invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role text not null default 'member' check (role in ('admin', 'editor', 'member', 'viewer')),
  token_hash text not null unique,
  invited_by uuid references auth.users (id) on delete set null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index workspace_invitations_ws_idx on public.workspace_invitations (workspace_id);
create index workspace_invitations_email_idx on public.workspace_invitations (lower(email));

create table public.workspace_settings (
  workspace_id uuid primary key references public.workspaces (id) on delete cascade,
  allow_member_invites boolean not null default false,
  default_invite_role text not null default 'member' check (default_invite_role in ('admin', 'editor', 'member', 'viewer')),
  invite_expiration_days integer not null default 7 check (invite_expiration_days between 1 and 30),
  ai_enabled boolean not null default true,
  color text check (color is null or color ~ '^#[0-9A-Fa-f]{6}$'),
  updated_at timestamptz not null default now()
);

create trigger workspace_settings_updated_at before update on public.workspace_settings
  for each row execute function public.set_updated_at();

create table public.workspace_audit_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces (id) on delete set null,
  workspace_name text,
  actor_id uuid references auth.users (id) on delete set null,
  action text not null,
  entity_type text,
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index workspace_audit_logs_ws_idx on public.workspace_audit_logs (workspace_id, created_at desc);
create index workspace_audit_logs_actor_idx on public.workspace_audit_logs (actor_id, created_at desc);

create table public.user_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  theme text not null default 'system' check (theme in ('light', 'dark', 'system')),
  default_workspace_id uuid references public.workspaces (id) on delete set null,
  notification_prefs jsonb not null default '{
    "prazos": true, "provas": true, "tarefas_atrasadas": true, "convites": true,
    "liga": true, "projetos": true, "revisoes": true, "metas": true
  }'::jsonb,
  calendar_prefs jsonb not null default '{"week_starts_on": 0, "default_view": "month"}'::jsonb,
  srs_settings jsonb not null default '{
    "initial_ease": 2.5, "min_ease": 1.3, "easy_bonus": 1.3,
    "hard_interval_factor": 1.2, "max_interval_days": 365, "first_intervals": [1, 6]
  }'::jsonb,
  ai_prefs jsonb not null default '{"answer_style": "didatico", "max_sources": 8}'::jsonb,
  sidebar_collapsed boolean not null default false,
  updated_at timestamptz not null default now()
);

create trigger user_preferences_updated_at before update on public.user_preferences
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Funções de autorização (SECURITY DEFINER evita recursão de RLS)
-- ---------------------------------------------------------------------

create or replace function public.workspace_role(p_workspace_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select m.role
    from public.workspace_members m
   where m.workspace_id = p_workspace_id
     and m.user_id = auth.uid();
$$;

create or replace function public.is_workspace_member(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.workspace_members m
     where m.workspace_id = p_workspace_id and m.user_id = auth.uid()
  );
$$;

-- Pode criar conteúdo (todos exceto viewer).
create or replace function public.can_write_workspace(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.workspace_role(p_workspace_id) in ('owner', 'admin', 'editor', 'member'), false);
$$;

-- Pode editar/excluir um registro: owner/admin/editor qualquer registro; member apenas os próprios.
create or replace function public.can_edit_row(p_workspace_id uuid, p_created_by uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case public.workspace_role(p_workspace_id)
           when 'owner' then true
           when 'admin' then true
           when 'editor' then true
           when 'member' then p_created_by is not null and p_created_by = auth.uid()
           else false
         end;
$$;

create or replace function public.is_workspace_admin(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.workspace_role(p_workspace_id) in ('owner', 'admin'), false);
$$;

create or replace function public.my_workspace_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.workspace_id from public.workspace_members m where m.user_id = auth.uid();
$$;

-- ---------------------------------------------------------------------
-- Auditoria
-- ---------------------------------------------------------------------

create or replace function public.write_audit(
  p_workspace_id uuid, p_action text, p_entity_type text, p_entity_id uuid, p_details jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.workspace_audit_logs (workspace_id, workspace_name, actor_id, action, entity_type, entity_id, details)
  values (
    p_workspace_id,
    (select w.name from public.workspaces w where w.id = p_workspace_id),
    auth.uid(),
    p_action,
    p_entity_type,
    p_entity_id,
    coalesce(p_details, '{}'::jsonb)
  );
end;
$$;
revoke all on function public.write_audit(uuid, text, text, uuid, jsonb) from public, anon, authenticated;

-- Registro de eventos sensíveis disparado pela aplicação (ex.: exportação, exclusão de arquivos).
create or replace function public.log_workspace_event(
  p_workspace_id uuid, p_action text, p_entity_type text default null, p_entity_id uuid default null, p_details jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Não autenticado' using errcode = '42501';
  end if;
  if p_workspace_id is not null and not public.is_workspace_member(p_workspace_id) then
    raise exception 'Acesso negado ao workspace' using errcode = '42501';
  end if;
  if p_action !~ '^[a-z_.]{3,64}$' then
    raise exception 'Ação de auditoria inválida';
  end if;
  perform public.write_audit(p_workspace_id, p_action, p_entity_type, p_entity_id, p_details);
end;
$$;

create or replace function public.tg_audit_workspace_members()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.write_audit(new.workspace_id, 'member.added', 'workspace_member', new.user_id, jsonb_build_object('role', new.role));
  elsif tg_op = 'UPDATE' and new.role is distinct from old.role then
    perform public.write_audit(new.workspace_id, 'member.role_changed', 'workspace_member', new.user_id,
      jsonb_build_object('from', old.role, 'to', new.role));
  elsif tg_op = 'DELETE' then
    if exists (select 1 from public.workspaces w where w.id = old.workspace_id) then
      perform public.write_audit(old.workspace_id, 'member.removed', 'workspace_member', old.user_id, jsonb_build_object('role', old.role));
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

create trigger workspace_members_audit after insert or update or delete on public.workspace_members
  for each row execute function public.tg_audit_workspace_members();

create or replace function public.tg_audit_workspaces()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    perform public.write_audit(new.id, 'workspace.updated', 'workspace', new.id,
      jsonb_build_object('name', new.name, 'previous_name', old.name));
  elsif tg_op = 'DELETE' then
    insert into public.workspace_audit_logs (workspace_id, workspace_name, actor_id, action, entity_type, entity_id, details)
    values (null, old.name, auth.uid(), 'workspace.deleted', 'workspace', old.id, jsonb_build_object('type', old.workspace_type));
  end if;
  return coalesce(new, old);
end;
$$;

create trigger workspaces_audit after update or delete on public.workspaces
  for each row execute function public.tg_audit_workspaces();

-- ---------------------------------------------------------------------
-- Criação automática: owner do workspace + configurações
-- ---------------------------------------------------------------------

create or replace function public.tg_workspace_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.workspace_members (workspace_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (workspace_id, user_id) do nothing;

  insert into public.workspace_settings (workspace_id) values (new.id)
  on conflict do nothing;

  perform public.write_audit(new.id, 'workspace.created', 'workspace', new.id, jsonb_build_object('type', new.workspace_type));
  return new;
end;
$$;

create trigger workspaces_after_insert after insert on public.workspaces
  for each row execute function public.tg_workspace_created();

-- Novo usuário: perfil, preferências e workspace pessoal.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ws uuid;
  v_name text := nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '');
begin
  insert into public.profiles (id, full_name) values (new.id, left(v_name, 160))
  on conflict (id) do nothing;

  insert into public.workspaces (name, workspace_type, is_personal, owner_id)
  values ('Meu espaço', 'pessoal', true, new.id)
  returning id into v_ws;

  insert into public.user_preferences (user_id, default_workspace_id) values (new.id, v_ws)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- Convites
-- ---------------------------------------------------------------------

create or replace function public.create_workspace_invitation(p_workspace_id uuid, p_email text, p_role text)
returns table (invitation_id uuid, token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settings public.workspace_settings;
  v_role text := public.workspace_role(p_workspace_id);
  v_token text;
  v_id uuid;
  v_expires timestamptz;
  v_email text := lower(trim(p_email));
  v_ws public.workspaces;
begin
  select * into v_ws from public.workspaces where id = p_workspace_id;
  if v_ws.id is null or v_role is null then
    raise exception 'Workspace não encontrado' using errcode = '42501';
  end if;
  if v_ws.is_personal then
    raise exception 'O workspace pessoal é privado e não aceita convites.' using errcode = '42501';
  end if;

  select * into v_settings from public.workspace_settings where workspace_id = p_workspace_id;

  if not (v_role in ('owner', 'admin') or (v_role in ('editor', 'member') and coalesce(v_settings.allow_member_invites, false))) then
    raise exception 'Sem permissão para convidar membros' using errcode = '42501';
  end if;
  if p_role not in ('admin', 'editor', 'member', 'viewer') then
    raise exception 'Papel inválido';
  end if;
  if p_role = 'admin' and v_role <> 'owner' then
    raise exception 'Somente o proprietário pode convidar administradores' using errcode = '42501';
  end if;
  if v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'E-mail inválido';
  end if;
  if exists (
    select 1 from public.workspace_members m join auth.users u on u.id = m.user_id
     where m.workspace_id = p_workspace_id and lower(u.email) = v_email
  ) then
    raise exception 'Este usuário já é membro do workspace';
  end if;

  -- Revoga convites pendentes anteriores para o mesmo e-mail.
  update public.workspace_invitations
     set revoked_at = now()
   where workspace_id = p_workspace_id and lower(email) = v_email and accepted_at is null and revoked_at is null;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_expires := now() + make_interval(days => coalesce(v_settings.invite_expiration_days, 7));

  insert into public.workspace_invitations (workspace_id, email, role, token_hash, invited_by, expires_at)
  values (p_workspace_id, v_email, p_role, encode(extensions.digest(v_token, 'sha256'), 'hex'), auth.uid(), v_expires)
  returning id into v_id;

  perform public.write_audit(p_workspace_id, 'invitation.created', 'workspace_invitation', v_id,
    jsonb_build_object('email', v_email, 'role', p_role));

  -- Notificação interna caso o convidado já tenha conta.
  insert into public.notifications (user_id, workspace_id, type, title, body, link, dedupe_key)
  select u.id, p_workspace_id, 'convite', 'Convite para workspace',
         'Você foi convidado(a) para "' || v_ws.name || '".', '/convites', 'invite:' || v_id
    from auth.users u
   where lower(u.email) = v_email
     and coalesce((select (p.notification_prefs ->> 'convites')::boolean from public.user_preferences p where p.user_id = u.id), true)
  on conflict (user_id, dedupe_key) do nothing;

  return query select v_id, v_token, v_expires;
end;
$$;

create or replace function public.accept_workspace_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.workspace_invitations;
  v_email text;
begin
  if auth.uid() is null then
    raise exception 'Não autenticado' using errcode = '42501';
  end if;

  select * into v_inv
    from public.workspace_invitations
   where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
   for update;

  if v_inv.id is null then
    raise exception 'Convite inválido' using errcode = 'P0002';
  end if;
  if v_inv.revoked_at is not null then
    raise exception 'Convite revogado' using errcode = 'P0001';
  end if;
  if v_inv.accepted_at is not null then
    raise exception 'Convite já utilizado' using errcode = 'P0001';
  end if;
  if v_inv.expires_at < now() then
    raise exception 'Convite expirado' using errcode = 'P0001';
  end if;

  select lower(u.email) into v_email from auth.users u where u.id = auth.uid();
  if v_email is distinct from lower(v_inv.email) then
    raise exception 'Este convite foi enviado para outro e-mail' using errcode = '42501';
  end if;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (v_inv.workspace_id, auth.uid(), v_inv.role)
  on conflict (workspace_id, user_id) do nothing;

  update public.workspace_invitations
     set accepted_at = now(), accepted_by = auth.uid()
   where id = v_inv.id;

  perform public.write_audit(v_inv.workspace_id, 'invitation.accepted', 'workspace_invitation', v_inv.id, '{}'::jsonb);
  return v_inv.workspace_id;
end;
$$;

-- Convites pendentes do usuário logado (por e-mail).
create or replace function public.my_pending_invitations()
returns table (id uuid, workspace_id uuid, workspace_name text, role text, expires_at timestamptz, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id, i.workspace_id, w.name, i.role, i.expires_at, i.created_at
    from public.workspace_invitations i
    join public.workspaces w on w.id = i.workspace_id
   where lower(i.email) = (select lower(u.email) from auth.users u where u.id = auth.uid())
     and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()
   order by i.created_at desc;
$$;

-- Aceite por ID (para convites listados dentro do app; e-mail precisa coincidir).
create or replace function public.accept_workspace_invitation_by_id(p_invitation_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.workspace_invitations;
begin
  if auth.uid() is null then
    raise exception 'Não autenticado' using errcode = '42501';
  end if;
  select * into v_inv from public.workspace_invitations where id = p_invitation_id for update;
  if v_inv.id is null
     or v_inv.revoked_at is not null
     or v_inv.accepted_at is not null
     or v_inv.expires_at < now()
     or lower(v_inv.email) is distinct from (select lower(u.email) from auth.users u where u.id = auth.uid()) then
    raise exception 'Convite inválido, expirado ou destinado a outro e-mail' using errcode = '42501';
  end if;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (v_inv.workspace_id, auth.uid(), v_inv.role)
  on conflict (workspace_id, user_id) do nothing;

  update public.workspace_invitations set accepted_at = now(), accepted_by = auth.uid() where id = v_inv.id;
  perform public.write_audit(v_inv.workspace_id, 'invitation.accepted', 'workspace_invitation', v_inv.id, '{}'::jsonb);
  return v_inv.workspace_id;
end;
$$;

-- Transferência de propriedade (somente owner atual).
create or replace function public.transfer_workspace_ownership(p_workspace_id uuid, p_new_owner uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.workspace_role(p_workspace_id) <> 'owner' then
    raise exception 'Somente o proprietário pode transferir o workspace' using errcode = '42501';
  end if;
  if (select is_personal from public.workspaces where id = p_workspace_id) then
    raise exception 'O workspace pessoal não pode ser transferido';
  end if;
  if not exists (select 1 from public.workspace_members where workspace_id = p_workspace_id and user_id = p_new_owner) then
    raise exception 'O novo proprietário precisa ser membro';
  end if;
  update public.workspace_members set role = 'admin' where workspace_id = p_workspace_id and user_id = auth.uid();
  update public.workspace_members set role = 'owner' where workspace_id = p_workspace_id and user_id = p_new_owner;
  update public.workspaces set owner_id = p_new_owner where id = p_workspace_id;
  perform public.write_audit(p_workspace_id, 'workspace.ownership_transferred', 'workspace', p_workspace_id,
    jsonb_build_object('new_owner', p_new_owner));
end;
$$;

-- ---------------------------------------------------------------------
-- Índice de busca global (mantido por triggers em cada tabela de conteúdo)
-- ---------------------------------------------------------------------

create table public.search_index (
  entity_type text not null,
  entity_id uuid not null,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  created_by uuid references auth.users (id) on delete set null,
  title text not null,
  subtitle text,
  body text,
  search_vector tsvector not null,
  updated_at timestamptz not null default now(),
  primary key (entity_type, entity_id)
);

create index search_index_vector_idx on public.search_index using gin (search_vector);
create index search_index_title_trgm_idx on public.search_index using gin (public.normalize_search(title) extensions.gin_trgm_ops);
create index search_index_ws_idx on public.search_index (workspace_id, entity_type);

-- ---------------------------------------------------------------------
-- Relacionamentos entre módulos ("Conteúdos relacionados")
-- ---------------------------------------------------------------------

create table public.entity_links (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  source_type text not null,
  source_id uuid not null,
  target_type text not null,
  target_id uuid not null,
  relation text not null default 'relacionado' check (relation in ('relacionado', 'anexo', 'referencia', 'sugerido_ia')),
  note text check (char_length(note) <= 500),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint entity_links_not_self check (not (source_type = target_type and source_id = target_id)),
  constraint entity_links_unique unique (source_type, source_id, target_type, target_id)
);

create index entity_links_source_idx on public.entity_links (source_type, source_id);
create index entity_links_target_idx on public.entity_links (target_type, target_id);
create index entity_links_ws_idx on public.entity_links (workspace_id);

-- Normaliza a ordem (relação é bidirecional) e garante que ambos os registros
-- existam e pertençam ao mesmo workspace do link.
create or replace function public.tg_entity_links_validate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tmp_type text;
  v_tmp_id uuid;
  v_src_ws uuid;
  v_tgt_ws uuid;
begin
  if (new.source_type, new.source_id::text) > (new.target_type, new.target_id::text) then
    v_tmp_type := new.source_type; v_tmp_id := new.source_id;
    new.source_type := new.target_type; new.source_id := new.target_id;
    new.target_type := v_tmp_type; new.target_id := v_tmp_id;
  end if;

  select workspace_id into v_src_ws from public.search_index where entity_type = new.source_type and entity_id = new.source_id;
  select workspace_id into v_tgt_ws from public.search_index where entity_type = new.target_type and entity_id = new.target_id;

  if v_src_ws is null or v_tgt_ws is null then
    raise exception 'Registro relacionado não encontrado';
  end if;
  if v_src_ws <> new.workspace_id or v_tgt_ws <> new.workspace_id then
    raise exception 'Somente registros do mesmo workspace podem ser relacionados';
  end if;
  return new;
end;
$$;

create trigger entity_links_validate before insert or update on public.entity_links
  for each row execute function public.tg_entity_links_validate();

-- Trigger genérico das tabelas de conteúdo:
--   TG_ARGV[0] = coluna de título, TG_ARGV[1] = coluna de subtítulo ('' se nenhuma),
--   TG_ARGV[2..] = colunas adicionais pesquisáveis.
create or replace function public.tg_index_entity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb;
  v_title text;
  v_subtitle text;
  v_body text := '';
  v_val jsonb;
  i int;
begin
  if tg_op = 'DELETE' then
    delete from public.search_index where entity_type = tg_table_name and entity_id = old.id;
    delete from public.entity_links
     where (source_type = tg_table_name and source_id = old.id)
        or (target_type = tg_table_name and target_id = old.id);
    return old;
  end if;

  v_row := to_jsonb(new);
  v_title := left(coalesce(nullif(v_row ->> tg_argv[0], ''), '(sem título)'), 500);
  v_subtitle := case when tg_argv[1] <> '' then left(v_row ->> tg_argv[1], 300) end;

  if tg_nargs > 2 then
    for i in 2 .. tg_nargs - 1 loop
      v_val := v_row -> tg_argv[i];
      if v_val is not null and v_val <> 'null'::jsonb then
        if jsonb_typeof(v_val) = 'array' then
          v_body := v_body || ' ' || coalesce((select string_agg(x, ' ') from jsonb_array_elements_text(v_val) as x), '');
        else
          v_body := v_body || ' ' || (v_row ->> tg_argv[i]);
        end if;
      end if;
    end loop;
  end if;
  if v_row ? 'tags' and jsonb_typeof(v_row -> 'tags') = 'array' then
    v_body := v_body || ' ' || coalesce((select string_agg(x, ' ') from jsonb_array_elements_text(v_row -> 'tags') as x), '');
  end if;
  v_body := left(v_body, 20000);

  insert into public.search_index (entity_type, entity_id, workspace_id, created_by, title, subtitle, body, search_vector, updated_at)
  values (
    tg_table_name, new.id, new.workspace_id, new.created_by, v_title, v_subtitle, left(trim(v_body), 2000),
    setweight(to_tsvector('simple', public.normalize_search(v_title)), 'A')
      || setweight(to_tsvector('simple', public.normalize_search(coalesce(v_subtitle, ''))), 'B')
      || setweight(to_tsvector('simple', public.normalize_search(v_body)), 'C'),
    now()
  )
  on conflict (entity_type, entity_id) do update
    set title = excluded.title,
        subtitle = excluded.subtitle,
        body = excluded.body,
        search_vector = excluded.search_vector,
        updated_at = now();
  return new;
end;
$$;

-- Garante que referências (FKs) apontem para registros do mesmo workspace.
create or replace function public.assert_same_workspace(p_table text, p_id uuid, p_workspace_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ws uuid;
begin
  if p_id is null then
    return;
  end if;
  execute format('select workspace_id from public.%I where id = $1', p_table) into v_ws using p_id;
  if v_ws is null or v_ws <> p_workspace_id then
    raise exception 'Referência inválida: % pertence a outro workspace ou não existe', p_table using errcode = '23503';
  end if;
end;
$$;

-- Busca global com autorização aplicada (RLS + filtro explícito por membership).
create or replace function public.global_search(
  p_query text,
  p_workspace_id uuid default null,
  p_types text[] default null,
  p_limit integer default 60
)
returns table (
  entity_type text,
  entity_id uuid,
  workspace_id uuid,
  title text,
  subtitle text,
  snippet text,
  rank real,
  updated_at timestamptz
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_tsq tsquery := public.build_prefix_tsquery(p_query);
  v_norm text := public.normalize_search(p_query);
begin
  if v_tsq is null or length(trim(v_norm)) < 2 then
    return;
  end if;
  return query
    select s.entity_type, s.entity_id, s.workspace_id, s.title, s.subtitle,
           left(s.body, 220) as snippet,
           (ts_rank(s.search_vector, v_tsq)
             + case when public.normalize_search(s.title) like '%' || v_norm || '%' then 1.0 else 0 end)::real as rank,
           s.updated_at
      from public.search_index s
     where s.workspace_id in (select public.my_workspace_ids())
       and (p_workspace_id is null or s.workspace_id = p_workspace_id)
       and (p_types is null or s.entity_type = any (p_types))
       and (s.search_vector @@ v_tsq or public.normalize_search(s.title) like '%' || v_norm || '%')
     order by rank desc, s.updated_at desc
     limit least(greatest(coalesce(p_limit, 60), 1), 200);
end;
$$;

-- ---------------------------------------------------------------------
-- Notificações
-- ---------------------------------------------------------------------

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete cascade,
  type text not null check (type in ('prazo', 'prova', 'tarefa_atrasada', 'convite', 'liga', 'projeto', 'revisao', 'meta', 'sistema')),
  title text not null,
  body text,
  link text check (link is null or link ~ '^/'),
  dedupe_key text not null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, dedupe_key)
);

create index notifications_user_idx on public.notifications (user_id, read_at, created_at desc);

-- ---------------------------------------------------------------------
-- RLS — núcleo
-- ---------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.user_preferences enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_invitations enable row level security;
alter table public.workspace_settings enable row level security;
alter table public.workspace_audit_logs enable row level security;
alter table public.search_index enable row level security;
alter table public.entity_links enable row level security;
alter table public.notifications enable row level security;

-- Perfis: o próprio usuário e colegas de workspace podem ver nome/instituição.
create policy profiles_select on public.profiles for select to authenticated
  using (
    id = auth.uid()
    or exists (
      select 1 from public.workspace_members m
       where m.user_id = profiles.id and m.workspace_id in (select public.my_workspace_ids())
    )
  );
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy user_preferences_select on public.user_preferences for select to authenticated using (user_id = auth.uid());
create policy user_preferences_update on public.user_preferences for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and (default_workspace_id is null or public.is_workspace_member(default_workspace_id)));

create policy workspaces_select on public.workspaces for select to authenticated using (public.is_workspace_member(id));
create policy workspaces_insert on public.workspaces for insert to authenticated
  with check (owner_id = auth.uid() and not is_personal and workspace_type <> 'pessoal');
create policy workspaces_update on public.workspaces for update to authenticated
  using (public.is_workspace_admin(id))
  with check (public.is_workspace_admin(id));
create policy workspaces_delete on public.workspaces for delete to authenticated
  using (owner_id = auth.uid() and public.workspace_role(id) = 'owner' and not is_personal);

-- Impede alterar owner/is_personal/tipo pessoal via UPDATE direto.
create or replace function public.tg_workspaces_protect()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.owner_id := old.owner_id;
    new.is_personal := old.is_personal;
    if old.is_personal then
      new.workspace_type := 'pessoal';
    elsif new.workspace_type = 'pessoal' then
      new.workspace_type := old.workspace_type;
    end if;
  end if;
  return new;
end;
$$;
create trigger workspaces_protect before update on public.workspaces
  for each row execute function public.tg_workspaces_protect();

create policy workspace_members_select on public.workspace_members for select to authenticated
  using (public.is_workspace_member(workspace_id));
-- Administradores alteram papéis (nunca o do owner, nunca para owner).
create policy workspace_members_update on public.workspace_members for update to authenticated
  using (public.is_workspace_admin(workspace_id) and role <> 'owner' and user_id <> auth.uid())
  with check (
    public.is_workspace_admin(workspace_id) and role <> 'owner'
    and (role <> 'admin' or public.workspace_role(workspace_id) = 'owner')
  );
-- Administradores removem membros (exceto owner); qualquer membro pode sair (exceto owner).
create policy workspace_members_delete on public.workspace_members for delete to authenticated
  using (
    role <> 'owner'
    and (
      user_id = auth.uid()
      or (public.is_workspace_admin(workspace_id) and (role <> 'admin' or public.workspace_role(workspace_id) = 'owner'))
    )
  );

create policy workspace_invitations_select on public.workspace_invitations for select to authenticated
  using (public.is_workspace_admin(workspace_id));
create policy workspace_invitations_update on public.workspace_invitations for update to authenticated
  using (public.is_workspace_admin(workspace_id)) with check (public.is_workspace_admin(workspace_id));
create policy workspace_invitations_delete on public.workspace_invitations for delete to authenticated
  using (public.is_workspace_admin(workspace_id));

-- O hash do token nunca é exposto à API.
revoke select on public.workspace_invitations from anon, authenticated;
grant select (id, workspace_id, email, role, invited_by, expires_at, accepted_at, accepted_by, revoked_at, created_at)
  on public.workspace_invitations to authenticated;
revoke insert on public.workspace_invitations from anon, authenticated;
revoke update on public.workspace_invitations from anon, authenticated;
grant update (revoked_at) on public.workspace_invitations to authenticated;

create policy workspace_settings_select on public.workspace_settings for select to authenticated
  using (public.is_workspace_member(workspace_id));
create policy workspace_settings_update on public.workspace_settings for update to authenticated
  using (public.is_workspace_admin(workspace_id)) with check (public.is_workspace_admin(workspace_id));

create policy workspace_audit_logs_select on public.workspace_audit_logs for select to authenticated
  using ((workspace_id is not null and public.is_workspace_admin(workspace_id)) or actor_id = auth.uid());

create policy search_index_select on public.search_index for select to authenticated
  using (public.is_workspace_member(workspace_id));

create policy entity_links_select on public.entity_links for select to authenticated
  using (public.is_workspace_member(workspace_id));
create policy entity_links_insert on public.entity_links for insert to authenticated
  with check (public.can_write_workspace(workspace_id) and created_by = auth.uid());
create policy entity_links_delete on public.entity_links for delete to authenticated
  using (public.can_edit_row(workspace_id, created_by));

create policy notifications_select on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notifications_delete on public.notifications for delete to authenticated using (user_id = auth.uid());
revoke update on public.notifications from anon, authenticated;
grant update (read_at) on public.notifications to authenticated;

-- Funções internas não devem ser chamadas diretamente pelo cliente.
revoke execute on function public.assert_same_workspace(text, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.tg_index_entity() from public, anon, authenticated;

-- >>> supabase/migrations/20260101000002_entities.sql
-- =====================================================================
-- Migration 0002: tabelas de conteúdo
-- ARQUIVO GERADO por scripts/generate-entity-sql.ts a partir de
-- src/modules/entities/definitions.ts. Não edite manualmente.
-- =====================================================================


-- Semestres (semesters)

create table public.semesters (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  name text not null,
  year integer,
  period text,
  start_date date,
  end_date date,
  is_current boolean default false not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint semesters_name_chk0 check (char_length(name) <= 120),
  constraint semesters_name_chk1 check (char_length(btrim(name)) > 0),
  constraint semesters_year_chk0 check (year is null or year >= 1990),
  constraint semesters_year_chk1 check (year is null or year <= 2100),
  constraint semesters_period_chk0 check (char_length(period) <= 1000),
  constraint semesters_notes_chk0 check (char_length(notes) <= 20000),
  constraint semesters_dates check (end_date is null or start_date is null or end_date >= start_date)
);

create index semesters_ws_idx on public.semesters (workspace_id, created_at desc);

create trigger semesters_protect before update on public.semesters
  for each row execute function public.protect_ownership();

create trigger semesters_index after insert or update or delete on public.semesters
  for each row execute function public.tg_index_entity('name', 'period', 'notes');

alter table public.semesters enable row level security;

create policy semesters_select on public.semesters for select to authenticated
  using (public.is_workspace_member(workspace_id));

create policy semesters_insert on public.semesters for insert to authenticated
  with check (public.can_write_workspace(workspace_id) and created_by = auth.uid());

create policy semesters_update on public.semesters for update to authenticated
  using (public.can_edit_row(workspace_id, created_by))
  with check (public.can_edit_row(workspace_id, created_by));

create policy semesters_delete on public.semesters for delete to authenticated
  using (public.can_edit_row(workspace_id, created_by));

-- Professores (professors)

create table public.professors (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  name text not null,
  email text,
  department text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint professors_name_chk0 check (char_length(name) <= 160),
  constraint professors_name_chk1 check (char_length(btrim(name)) > 0),
  constraint professors_email_chk0 check (char_length(email) <= 320),
  constraint professors_email_chk1 check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  constraint professors_department_chk0 check (char_length(department) <= 1000),
  constraint professors_notes_chk0 check (char_length(notes) <= 20000)
);

create index professors_ws_idx on public.professors (workspace_id, created_at desc);

create trigger professors_protect before update on public.professors
  for each row execute function public.protect_ownership();

create trigger professors_index after insert or update or delete on public.professors
  for each row execute function public.tg_index_entity('name', 'department', 'department', 'notes');

alter table public.professors enable row level security;

create policy professors_select on public.professors for select to authenticated
  using (public.is_workspace_member(workspace_id));

create policy professors_insert on public.professors for insert to authenticated
  with check (public.can_write_workspace(workspace_id) and created_by = auth.uid());

create policy professors_update on public.professors for update to authenticated
  using (public.can_edit_row(workspace_id, created_by))
  with check (public.can_edit_row(workspace_id, created_by));

create policy professors_delete on public.professors for delete to authenticated
  using (public.can_edit_row(workspace_id, created_by));

-- Disciplinas (subjects)

create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  name text not null,
  code text,
  semester_id uuid,
  professor_id uuid,
  workload_hours integer,
  study_status text default 'nao_estudado',
  learning_progress integer default 0,
  final_grade numeric,
  syllabus text,
  bibliography text,
  notes text,
  tags text[] default '{}'::text[] not null,
  is_favorite boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subjects_name_chk0 check (char_length(name) <= 200),
  constraint subjects_name_chk1 check (char_length(btrim(name)) > 0),
  constraint subjects_code_chk0 check (char_length(code) <= 1000),
  constraint subjects_workload_hours_chk0 check (workload_hours is null or workload_hours >= 0),
  constraint subjects_workload_hours_chk1 check (workload_hours is null or workload_hours <= 2000),
  constraint subjects_study_status_chk0 check (char_length(study_status) <= 64),
  constraint subjects_study_status_chk1 check (study_status is null or study_status in ('nao_estudado', 'em_andamento', 'estudado', 'revisar')),
  constraint subjects_learning_progress_chk0 check (learning_progress is null or learning_progress >= 0),
  constraint subjects_learning_progress_chk1 check (learning_progress is null or learning_progress <= 100),
  constraint subjects_final_grade_chk0 check (final_grade is null or final_grade >= 0),
  constraint subjects_final_grade_chk1 check (final_grade is null or final_grade <= 100),
  constraint subjects_syllabus_chk0 check (char_length(syllabus) <= 200000),
  constraint subjects_bibliography_chk0 check (char_length(bibliography) <= 200000),
  constraint subjects_notes_chk0 check (char_length(notes) <= 20000),
  constraint subjects_tags_chk0 check (cardinality(tags) <= 50)
);

create index subjects_ws_idx on public.subjects (workspace_id, created_at desc);

create index subjects_semester_id_idx on public.subjects (semester_id);

create index subjects_professor_id_idx on public.subjects (professor_id);

create index subjects_study_status_idx on public.subjects (workspace_id, study_status);

create trigger subjects_protect before update on public.subjects
  for each row execute function public.protect_ownership();

create or replace function public.tg_subjects_refs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.semester_id is distinct from old.semester_id then
    perform public.assert_same_workspace('semesters', new.semester_id, new.workspace_id);
  end if;
  if tg_op = 'INSERT' or new.professor_id is distinct from old.professor_id then
    perform public.assert_same_workspace('professors', new.professor_id, new.workspace_id);
  end if;
  return new;
end;
$$;

create trigger subjects_refs before insert or update on public.subjects
  for each row execute function public.tg_subjects_refs();

create trigger subjects_index after insert or update or delete on public.subjects
  for each row execute function public.tg_index_entity('name', 'code', 'code', 'syllabus', 'bibliography', 'notes');

alter table public.subjects enable row level security;

create policy subjects_select on public.subjects for select to authenticated
  using (public.is_workspace_member(workspace_id));

create policy subjects_insert on public.subjects for insert to authenticated
  with check (public.can_write_workspace(workspace_id) and created_by = auth.uid());

create policy subjects_update on public.subjects for update to authenticated
  using (public.can_edit_row(workspace_id, created_by))
  with check (public.can_edit_row(workspace_id, created_by));

create policy subjects_delete on public.subjects for delete to authenticated
  using (public.can_edit_row(workspace_id, created_by));

-- Pastas (library_folders)

create table public.library_folders (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  name text not null,
  parent_id uuid,
  subject_id uuid,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint library_folders_name_chk0 check (char_length(name) <= 160),
  constraint library_folders_name_chk1 check (char_length(btrim(name)) > 0),
  constraint library_folders_description_chk0 check (char_length(description) <= 20000)
);

create index library_folders_ws_idx on public.library_folders (workspace_id, created_at desc);

create index library_folders_parent_id_idx on public.library_folders (parent_id);

create index library_folders_subject_id_idx on public.library_folders (subject_id);

create trigger library_folders_protect before update on public.library_folders
  for each row execute function public.protect_ownership();

create or replace function public.tg_library_folders_refs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.parent_id is distinct from old.parent_id then
    perform public.assert_same_workspace('library_folders', new.parent_id, new.workspace_id);
  end if;
  if tg_op = 'INSERT' or new.subject_id is distinct from old.subject_id then
    perform public.assert_same_workspace('subjects', new.subject_id, new.workspace_id);
  end if;
  return new;
end;
$$;

create trigger library_folders_refs before insert or update on public.library_folders
  for each row execute function public.tg_library_folders_refs();

create trigger library_folders_index after insert or update or delete on public.library_folders
  for each row execute function public.tg_index_entity('name', '', 'description');

alter table public.library_folders enable row level security;

create policy library_folders_select on public.library_folders for select to authenticated
  using (public.is_workspace_member(workspace_id));

create policy library_folders_insert on public.library_folders for insert to authenticated
  with check (public.can_write_workspace(workspace_id) and created_by = auth.uid());

create policy library_folders_update on public.library_folders for update to authenticated
  using (public.can_edit_row(workspace_id, created_by))
  with check (public.can_edit_row(workspace_id, created_by));

create policy library_folders_delete on public.library_folders for delete to authenticated
  using (public.can_edit_row(workspace_id, created_by));

-- Caderno de estudos (study_notes)

create table public.study_notes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  title text not null,
  subject_id uuid,
  topic text,
  note_type text default 'anotacao',
  study_status text default 'em_andamento',
  content text,
  external_url text,
  tags text[] default '{}'::text[] not null,
  is_favorite boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint study_notes_title_chk0 check (char_length(title) <= 200),
  constraint study_notes_title_chk1 check (char_length(btrim(title)) > 0),
  constraint study_notes_topic_chk0 check (char_length(topic) <= 1000),
  constraint study_notes_note_type_chk0 check (char_length(note_type) <= 64),
  constraint study_notes_note_type_chk1 check (note_type is null or note_type in ('anotacao', 'resumo', 'mapa_mental', 'perguntas_respostas')),
  constraint study_notes_study_status_chk0 check (char_length(study_status) <= 64),
  constraint study_notes_study_status_chk1 check (study_status is null or study_status in ('nao_estudado', 'em_andamento', 'estudado', 'revisar')),
  constraint study_notes_content_chk0 check (char_length(content) <= 200000),
  constraint study_notes_external_url_chk0 check (char_length(external_url) <= 2000),
  constraint study_notes_external_url_chk1 check (external_url is null or external_url ~* '^https?://'),
  constraint study_notes_tags_chk0 check (cardinality(tags) <= 50)
);

create index study_notes_ws_idx on public.study_notes (workspace_id, created_at desc);

create index study_notes_subject_id_idx on public.study_notes (subject_id);

create index study_notes_study_status_idx on public.study_notes (workspace_id, study_status);

create trigger study_notes_protect before update on public.study_notes
  for each row execute function public.protect_ownership();

create or replace function public.tg_study_notes_refs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.subject_id is distinct from old.subject_id then
    perform public.assert_same_workspace('subjects', new.subject_id, new.workspace_id);
  end if;
  return new;
end;
$$;

create trigger study_notes_refs before insert or update on public.study_notes
  for each row execute function public.tg_study_notes_refs();

create trigger study_notes_index after insert or update or delete on public.study_notes
  for each row execute function public.tg_index_entity('title', 'topic', 'topic', 'content');

alter table public.study_notes enable row level security;

create policy study_notes_select on public.study_notes for select to authenticated
  using (public.is_workspace_member(workspace_id));

create policy study_notes_insert on public.study_notes for insert to authenticated
  with check (public.can_write_workspace(workspace_id) and created_by = auth.uid());

create policy study_notes_update on public.study_notes for update to authenticated
  using (public.can_edit_row(workspace_id, created_by))
  with check (public.can_edit_row(workspace_id, created_by));

create policy study_notes_delete on public.study_notes for delete to authenticated
  using (public.can_edit_row(workspace_id, created_by));

-- Eventos da agenda (events)

create table public.events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  title text not null,
  category text default 'aula' not null,
  start_at timestamptz not null,
  end_at timestamptz,
  all_day boolean default false not null,
  location text,
  priority text default 'media',
  recurrence text default 'nenhuma',
  recurrence_until date,
  reminder_minutes integer,
  subject_id uuid,
  project_id uuid,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint events_title_chk0 check (char_length(title) <= 200),
  constraint events_title_chk1 check (char_length(btrim(title)) > 0),
  constraint events_category_chk0 check (char_length(category) <= 64),
  constraint events_category_chk1 check (char_length(btrim(category)) > 0),
  constraint events_category_chk2 check (category is null or category in ('aula', 'prova', 'trabalho', 'pesquisa', 'liga', 'estagio', 'pessoal')),
  constraint events_location_chk0 check (char_length(location) <= 1000),
  constraint events_priority_chk0 check (char_length(priority) <= 64),
  constraint events_priority_chk1 check (priority is null or priority in ('baixa', 'media', 'alta', 'urgente')),
  constraint events_recurrence_chk0 check (char_length(recurrence) <= 64),
  constraint events_recurrence_chk1 check (recurrence is null or recurrence in ('nenhuma', 'diaria', 'semanal', 'mensal')),
  constraint events_reminder_minutes_chk0 check (reminder_minutes is null or reminder_minutes >= 0),
  constraint events_reminder_minutes_chk1 check (reminder_minutes is null or reminder_minutes <= 40320),
  constraint events_description_chk0 check (char_length(description) <= 20000),
  constraint events_dates check (end_at is null or end_at >= start_at)
);

create index events_ws_idx on public.events (workspace_id, created_at desc);

create index events_subject_id_idx on public.events (subject_id);

create index events_project_id_idx on public.events (project_id);

create index events_start_at_idx on public.events (workspace_id, start_at);

create trigger events_protect before update on public.events
  for each row execute function public.protect_ownership();

create or replace function public.tg_events_refs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.subject_id is distinct from old.subject_id then
    perform public.assert_same_workspace('subjects', new.subject_id, new.workspace_id);
  end if;
  if tg_op = 'INSERT' or new.project_id is distinct from old.project_id then
    perform public.assert_same_workspace('projects', new.project_id, new.workspace_id);
  end if;
  return new;
end;
$$;

create trigger events_refs before insert or update on public.events
  for each row execute function public.tg_events_refs();

create trigger events_index after insert or update or delete on public.events
  for each row execute function public.tg_index_entity('title', 'location', 'location', 'description');

alter table public.events enable row level security;

create policy events_select on public.events for select to authenticated
  using (public.is_workspace_member(workspace_id));

create policy events_insert on public.events for insert to authenticated
  with check (public.can_write_workspace(workspace_id) and created_by = auth.uid());

create policy events_update on public.events for update to authenticated
  using (public.can_edit_row(workspace_id, created_by))
  with check (public.can_edit_row(workspace_id, created_by));

create policy events_delete on public.events for delete to authenticated
  using (public.can_edit_row(workspace_id, created_by));

-- Tarefas (tasks)

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  title text not null,
  description text,
  due_at timestamptz,
  priority text default 'media',
  category text default 'trabalho',
  status text default 'pendente',
  subject_id uuid,
  project_id uuid,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tasks_title_chk0 check (char_length(title) <= 200),
  constraint tasks_title_chk1 check (char_length(btrim(title)) > 0),
  constraint tasks_description_chk0 check (char_length(description) <= 20000),
  constraint tasks_priority_chk0 check (char_length(priority) <= 64),
  constraint tasks_priority_chk1 check (priority is null or priority in ('baixa', 'media', 'alta', 'urgente')),
  constraint tasks_category_chk0 check (char_length(category) <= 64),
  constraint tasks_category_chk1 check (category is null or category in ('aula', 'prova', 'trabalho', 'pesquisa', 'liga', 'estagio', 'pessoal')),
  constraint tasks_status_chk0 check (char_length(status) <= 64),
  constraint tasks_status_chk1 check (status is null or status in ('pendente', 'em_andamento', 'concluida', 'cancelada'))
);

create index tasks_ws_idx on public.tasks (workspace_id, created_at desc);

create index tasks_subject_id_idx on public.tasks (subject_id);

create index tasks_project_id_idx on public.tasks (project_id);

create index tasks_due_at_idx on public.tasks (workspace_id, due_at);

create index tasks_status_idx on public.tasks (workspace_id, status);

create trigger tasks_protect before update on public.tasks
  for each row execute function public.protect_ownership();

create or replace function public.tg_tasks_refs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.subject_id is distinct from old.subject_id then
    perform public.assert_same_workspace('subjects', new.subject_id, new.workspace_id);
  end if;
  if tg_op = 'INSERT' or new.project_id is distinct from old.project_id then
    perform public.assert_same_workspace('projects', new.project_id, new.workspace_id);
  end if;
  return new;
end;
$$;

create trigger tasks_refs before insert or update on public.tasks
  for each row execute function public.tg_tasks_refs();

create trigger tasks_index after insert or update or delete on public.tasks
  for each row execute function public.tg_index_entity('title', '', 'description');

alter table public.tasks enable row level security;

create policy tasks_select on public.tasks for select to authenticated
  using (public.is_workspace_member(workspace_id));

create policy tasks_insert on public.tasks for insert to authenticated
  with check (public.can_write_workspace(workspace_id) and created_by = auth.uid());

create policy tasks_update on public.tasks for update to authenticated
  using (public.can_edit_row(workspace_id, created_by))
  with check (public.can_edit_row(workspace_id, created_by));

create policy tasks_delete on public.tasks for delete to authenticated
  using (public.can_edit_row(workspace_id, created_by));

-- Avaliações e provas (assessments)

create table public.assessments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  title text not null,
  subject_id uuid,
  assessment_type text default 'prova',
  assessment_date timestamptz,
  status text default 'agendada',
  weight numeric,
  max_score numeric default 10,
  score numeric,
  content text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assessments_title_chk0 check (char_length(title) <= 200),
  constraint assessments_title_chk1 check (char_length(btrim(title)) > 0),
  constraint assessments_assessment_type_chk0 check (char_length(assessment_type) <= 64),
  constraint assessments_assessment_type_chk1 check (assessment_type is null or assessment_type in ('prova', 'trabalho', 'seminario', 'pratica', 'osce', 'outro')),
  constraint assessments_status_chk0 check (char_length(status) <= 64),
  constraint assessments_status_chk1 check (status is null or status in ('agendada', 'realizada', 'cancelada')),
  constraint assessments_weight_chk0 check (weight is null or weight >= 0),
  constraint assessments_weight_chk1 check (weight is null or weight <= 100),
  constraint assessments_max_score_chk0 check (max_score is null or max_score >= 0),
  constraint assessments_max_score_chk1 check (max_score is null or max_score <= 1000),
  constraint assessments_score_chk0 check (score is null or score >= 0),
  constraint assessments_score_chk1 check (score is null or score <= 1000),
  constraint assessments_content_chk0 check (char_length(content) <= 200000),
  constraint assessments_notes_chk0 check (char_length(notes) <= 20000),
  constraint assessments_score check (score is null or max_score is null or score <= max_score)
);

create index assessments_ws_idx on public.assessments (workspace_id, created_at desc);

create index assessments_subject_id_idx on public.assessments (subject_id);

create index assessments_assessment_date_idx on public.assessments (workspace_id, assessment_date);

create index assessments_status_idx on public.assessments (workspace_id, status);

create trigger assessments_protect before update on public.assessments
  for each row execute function public.protect_ownership();

create or replace function public.tg_assessments_refs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.subject_id is distinct from old.subject_id then
    perform public.assert_same_workspace('subjects', new.subject_id, new.workspace_id);
  end if;
  return new;
end;
$$;

create trigger assessments_refs before insert or update on public.assessments
  for each row execute function public.tg_assessments_refs();

create trigger assessments_index after insert or update or delete on public.assessments
  for each row execute function public.tg_index_entity('title', '', 'content', 'notes');

alter table public.assessments enable row level security;

create policy assessments_select on public.assessments for select to authenticated
  using (public.is_workspace_member(workspace_id));

create policy assessments_insert on public.assessments for insert to authenticated
  with check (public.can_write_workspace(workspace_id) and created_by = auth.uid());

create policy assessments_update on public.assessments for update to authenticated
  using (public.can_edit_row(workspace_id, created_by))
  with check (public.can_edit_row(workspace_id, created_by));

create policy assessments_delete on public.assessments for delete to authenticated
  using (public.can_edit_row(workspace_id, created_by));

-- Artigos científicos (articles)

create table public.articles (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  title text not null,
  authors text,
  year integer,
  doi text,
  journal text,
  volume text,
  issue text,
  pages text,
  url text,
  keywords text[] default '{}'::text[] not null,
  knowledge_area text,
  study_type text,
  reading_status text default 'nao_lido',
  read_date date,
  objective text,
  methodology text,
  sample text,
  results text,
  conclusion text,
  limitations text,
  critical_analysis text,
  tags text[] default '{}'::text[] not null,
  is_favorite boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint articles_title_chk0 check (char_length(title) <= 500),
  constraint articles_title_chk1 check (char_length(btrim(title)) > 0),
  constraint articles_authors_chk0 check (char_length(authors) <= 20000),
  constraint articles_year_chk0 check (year is null or year >= 1800),
  constraint articles_year_chk1 check (year is null or year <= 2100),
  constraint articles_doi_chk0 check (char_length(doi) <= 1000),
  constraint articles_journal_chk0 check (char_length(journal) <= 1000),
  constraint articles_volume_chk0 check (char_length(volume) <= 1000),
  constraint articles_issue_chk0 check (char_length(issue) <= 1000),
  constraint articles_pages_chk0 check (char_length(pages) <= 1000),
  constraint articles_url_chk0 check (char_length(url) <= 2000),
  constraint articles_url_chk1 check (url is null or url ~* '^https?://'),
  constraint articles_keywords_chk0 check (cardinality(keywords) <= 50),
  constraint articles_knowledge_area_chk0 check (char_length(knowledge_area) <= 1000),
  constraint articles_study_type_chk0 check (char_length(study_type) <= 64),
  constraint articles_study_type_chk1 check (study_type is null or study_type in ('ensaio_clinico_randomizado', 'revisao_sistematica', 'meta_analise', 'coorte', 'caso_controle', 'transversal', 'relato_caso', 'revisao_narrativa', 'revisao_integrativa', 'qualitativo', 'diretriz', 'outro')),
  constraint articles_reading_status_chk0 check (char_length(reading_status) <= 64),
  constraint articles_reading_status_chk1 check (reading_status is null or reading_status in ('nao_lido', 'em_leitura', 'lido', 'revisar')),
  constraint articles_objective_chk0 check (char_length(objective) <= 20000),
  constraint articles_methodology_chk0 check (char_length(methodology) <= 20000),
  constraint articles_sample_chk0 check (char_length(sample) <= 20000),
  constraint articles_results_chk0 check (char_length(results) <= 20000),
  constraint articles_conclusion_chk0 check (char_length(conclusion) <= 20000),
  constraint articles_limitations_chk0 check (char_length(limitations) <= 20000),
  constraint articles_critical_analysis_chk0 check (char_length(critical_analysis) <= 200000),
  constraint articles_tags_chk0 check (cardinality(tags) <= 50)
);

create index articles_ws_idx on public.articles (workspace_id, created_at desc);

create index articles_reading_status_idx on public.articles (workspace_id, reading_status);

create trigger articles_protect before update on public.articles
  for each row execute function public.protect_ownership();

create trigger articles_index after insert or update or delete on public.articles
  for each row execute function public.tg_index_entity('title', 'authors', 'authors', 'doi', 'journal', 'keywords', 'knowledge_area', 'objective', 'results', 'conclusion');

alter table public.articles enable row level security;

create policy articles_select on public.articles for select to authenticated
  using (public.is_workspace_member(workspace_id));

create policy articles_insert on public.articles for insert to authenticated
  with check (public.can_write_workspace(workspace_id) and created_by = auth.uid());

create policy articles_update on public.articles for update to authenticated
  using (public.can_edit_row(workspace_id, created_by))
  with check (public.can_edit_row(workspace_id, created_by));

create policy articles_delete on public.articles for delete to authenticated
  using (public.can_edit_row(workspace_id, created_by));

-- Coleções de artigos (article_collections)

create table public.article_collections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint article_collections_name_chk0 check (char_length(name) <= 160),
  constraint article_collections_name_chk1 check (char_length(btrim(name)) > 0),
  constraint article_collections_description_chk0 check (char_length(description) <= 20000)
);

create index article_collections_ws_idx on public.article_collections (workspace_id, created_at desc);

create trigger article_collections_protect before update on public.article_collections
  for each row execute function public.protect_ownership();

create trigger article_collections_index after insert or update or delete on public.article_collections
  for each row execute function public.tg_index_entity('name', '', 'description');

alter table public.article_collections enable row level security;

create policy article_collections_select on public.article_collections for select to authenticated
  using (public.is_workspace_member(workspace_id));

create policy article_collections_insert on public.article_collections for insert to authenticated
  with check (public.can_write_workspace(workspace_id) and created_by = auth.uid());

create policy article_collections_update on public.article_collections for update to authenticated
  using (public.can_edit_row(workspace_id, created_by))
  with check (public.can_edit_row(workspace_id, created_by));

create policy article_collections_delete on public.article_collections for delete to authenticated
  using (public.can_edit_row(workspace_id, created_by));

-- Fichamentos (article_notes)

create table public.article_notes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  article_id uuid not null,
  title text not null,
  note_type text default 'resumo',
  page_reference text,
  content text not null,
  tags text[] default '{}'::text[] not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint article_notes_title_chk0 check (char_length(title) <= 200),
  constraint article_notes_title_chk1 check (char_length(btrim(title)) > 0),
  constraint article_notes_note_type_chk0 check (char_length(note_type) <= 64),
  constraint article_notes_note_type_chk1 check (note_type is null or note_type in ('resumo', 'citacao', 'comentario', 'bibliografico')),
  constraint article_notes_page_reference_chk0 check (char_length(page_reference) <= 1000),
  constraint article_notes_content_chk0 check (char_length(content) <= 200000),
  constraint article_notes_content_chk1 check (char_length(btrim(content)) > 0),
  constraint article_notes_tags_chk0 check (cardinality(tags) <= 50)
);

create index article_notes_ws_idx on public.article_notes (workspace_id, created_at desc);

create index article_notes_article_id_idx on public.article_notes (article_id);

create trigger article_notes_protect before update on public.article_notes
  for each row execute function public.protect_ownership();

create or replace function public.tg_article_notes_refs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.article_id is distinct from old.article_id then
    perform public.assert_same_workspace('articles', new.article_id, new.workspace_id);
  end if;
  return new;
end;
$$;

create trigger article_notes_refs before insert or update on public.article_notes
  for each row execute function public.tg_article_notes_refs();

create trigger article_notes_index after insert or update or delete on public.article_notes
  for each row execute function public.tg_index_entity('title', '', 'content', 'page_reference');

alter table public.article_notes enable row level security;

create policy article_notes_select on public.article_notes for select to authenticated
  using (public.is_workspace_member(workspace_id));

create policy article_notes_insert on public.article_notes for insert to authenticated
  with check (public.can_write_workspace(workspace_id) and created_by = auth.uid());

create policy article_notes_update on public.article_notes for update to authenticated
  using (public.can_edit_row(workspace_id, created_by))
  with check (public.can_edit_row(workspace_id, created_by));

create policy article_notes_delete on public.article_notes for delete to authenticated
  using (public.can_edit_row(workspace_id, created_by));

-- Referências bibliográficas (citations)

create table public.citations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  reference_type text default 'artigo' not null,
  article_id uuid,
  authors text,
  title text not null,
  subtitle text,
  source text,
  edition text,
  place text,
  publisher text,
  volume text,
  issue text,
  pages text,
  year integer,
  doi text,
  url text,
  access_date date,
  formatted_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint citations_reference_type_chk0 check (char_length(reference_type) <= 64),
  constraint citations_reference_type_chk1 check (char_length(btrim(reference_type)) > 0),
  constraint citations_reference_type_chk2 check (reference_type is null or reference_type in ('artigo', 'livro', 'capitulo', 'site', 'tese', 'outro')),
  constraint citations_authors_chk0 check (char_length(authors) <= 20000),
  constraint citations_title_chk0 check (char_length(title) <= 500),
  constraint citations_title_chk1 check (char_length(btrim(title)) > 0),
  constraint citations_subtitle_chk0 check (char_length(subtitle) <= 1000),
  constraint citations_source_chk0 check (char_length(source) <= 1000),
  constraint citations_edition_chk0 check (char_length(edition) <= 1000),
  constraint citations_place_chk0 check (char_length(place) <= 1000),
  constraint citations_publisher_chk0 check (char_length(publisher) <= 1000),
  constraint citations_volume_chk0 check (char_length(volume) <= 1000),
  constraint citations_issue_chk0 check (char_length(issue) <= 1000),
  constraint citations_pages_chk0 check (char_length(pages) <= 1000),
  constraint citations_year_chk0 check (year is null or year >= 1500),
  constraint citations_year_chk1 check (year is null or year <= 2100),
  constraint citations_doi_chk0 check (char_length(doi) <= 1000),
  constraint citations_url_chk0 check (char_length(url) <= 2000),
  constraint citations_url_chk1 check (url is null or url ~* '^https?://'),
  constraint citations_formatted_reference_chk0 check (char_length(formatted_reference) <= 200000)
);

create index citations_ws_idx on public.citations (workspace_id, created_at desc);

create index citations_article_id_idx on public.citations (article_id);

create trigger citations_protect before update on public.citations
  for each row execute function public.protect_ownership();

create or replace function public.tg_citations_refs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.article_id is distinct from old.article_id then
    perform public.assert_same_workspace('articles', new.article_id, new.workspace_id);
  end if;
  return new;
end;
$$;

create trigger citations_refs before insert or update on public.citations
  for each row execute function public.tg_citations_refs();

create trigger citations_index after insert or update or delete on public.citations
  for each row execute function public.tg_index_entity('title', 'authors', 'authors', 'source', 'formatted_reference');

alter table public.citations enable row level security;

create policy citations_select on public.citations for select to authenticated
  using (public.is_workspace_member(workspace_id));

create policy citations_insert on public.citations for insert to authenticated
  with check (public.can_write_workspace(workspace_id) and created_by = auth.uid());

create policy citations_update on public.citations for update to authenticated
  using (public.can_edit_row(workspace_id, created_by))
  with check (public.can_edit_row(workspace_id, created_by));

create policy citations_delete on public.citations for delete to authenticated
  using (public.can_edit_row(workspace_id, created_by));

-- Banco de patologias (pathologies)

create table public.pathologies (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  name text not null,
  specialty text,
  body_region text,
  mastery_level text default 'iniciante',
  study_status text default 'nao_estudado',
  definition text,
  epidemiology text,
  etiology text,
  risk_factors text,
  pathophysiology text,
  related_anatomy text,
  signs_symptoms text,
  clinical_picture text,
  differential_diagnosis text,
  pt_assessment text,
  specific_tests text,
  scales text,
  kinetic_functional_diagnosis text,
  therapeutic_goals text,
  conservative_treatment text,
  postoperative_treatment text,
  exercises_notes text,
  scientific_evidence text,
  references_text text,
  tags text[] default '{}'::text[] not null,
  is_favorite boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pathologies_name_chk0 check (char_length(name) <= 200),
  constraint pathologies_name_chk1 check (char_length(btrim(name)) > 0),
  constraint pathologies_specialty_chk0 check (char_length(specialty) <= 64),
  constraint pathologies_specialty_chk1 check (specialty is null or specialty in ('traumato_ortopedia', 'neurofuncional', 'cardiovascular', 'respiratoria', 'esportiva', 'pediatrica', 'gerontologia', 'saude_mulher', 'outra')),
  constraint pathologies_body_region_chk0 check (char_length(body_region) <= 64),
  constraint pathologies_body_region_chk1 check (body_region is null or body_region in ('ombro', 'cotovelo', 'punho_mao', 'coluna_cervical', 'coluna_toracica', 'coluna_lombar', 'quadril', 'joelho', 'tornozelo_pe', 'cabeca_pescoco', 'torax', 'sistemica')),
  constraint pathologies_mastery_level_chk0 check (char_length(mastery_level) <= 64),
  constraint pathologies_mastery_level_chk1 check (mastery_level is null or mastery_level in ('iniciante', 'basico', 'intermediario', 'avancado')),
  constraint pathologies_study_status_chk0 check (char_length(study_status) <= 64),
  constraint pathologies_study_status_chk1 check (study_status is null or study_status in ('nao_estudado', 'em_andamento', 'estudado', 'revisar')),
  constraint pathologies_definition_chk0 check (char_length(definition) <= 20000),
  constraint pathologies_epidemiology_chk0 check (char_length(epidemiology) <= 20000),
  constraint pathologies_etiology_chk0 check (char_length(etiology) <= 20000),
  constraint pathologies_risk_factors_chk0 check (char_length(risk_factors) <= 20000),
  constraint pathologies_pathophysiology_chk0 check (char_length(pathophysiology) <= 20000),
  constraint pathologies_related_anatomy_chk0 check (char_length(related_anatomy) <= 20000),
  constraint pathologies_signs_symptoms_chk0 check (char_length(signs_symptoms) <= 20000),
  constraint pathologies_clinical_picture_chk0 check (char_length(clinical_picture) <= 20000),
  constraint pathologies_differential_diagnosis_chk0 check (char_length(differential_diagnosis) <= 20000),
  constraint pathologies_pt_assessment_chk0 check (char_length(pt_assessment) <= 20000),
  constraint pathologies_specific_tests_chk0 check (char_length(specific_tests) <= 20000),
  constraint pathologies_scales_chk0 check (char_length(scales) <= 20000),
  constraint pathologies_kinetic_functional_diagnosis_chk0 check (char_length(kinetic_functional_diagnosis) <= 20000),
  constraint pathologies_therapeutic_goals_chk0 check (char_length(therapeutic_goals) <= 20000),
  constraint pathologies_conservative_treatment_chk0 check (char_length(conservative_treatment) <= 200000),
  constraint pathologies_postoperative_treatment_chk0 check (char_length(postoperative_treatment) <= 200000),
  constraint pathologies_exercises_notes_chk0 check (char_length(exercises_notes) <= 20000),
  constraint pathologies_scientific_evidence_chk0 check (char_length(scientific_evidence) <= 200000),
  constraint pathologies_references_text_chk0 check (char_length(references_text) <= 200000),
  constraint pathologies_tags_chk0 check (cardinality(tags) <= 50)
);

create index pathologies_ws_idx on public.pathologies (workspace_id, created_at desc);

create index pathologies_study_status_idx on public.pathologies (workspace_id, study_status);

create trigger pathologies_protect before update on public.pathologies
  for each row execute function public.protect_ownership();

create trigger pathologies_index after insert or update or delete on public.pathologies
  for each row execute function public.tg_index_entity('name', 'specialty', 'definition', 'etiology', 'signs_symptoms', 'clinical_picture', 'related_anatomy', 'differential_diagnosis');

alter table public.pathologies enable row level security;

create policy pathologies_select on public.pathologies for select to authenticated
  using (public.is_workspace_member(workspace_id));

create policy pathologies_insert on public.pathologies for insert to authenticated
  with check (public.can_write_workspace(workspace_id) and created_by = auth.uid());

create policy pathologies_update on public.pathologies for update to authenticated
  using (public.can_edit_row(workspace_id, created_by))
  with check (public.can_edit_row(workspace_id, created_by));

create policy pathologies_delete on public.pathologies for delete to authenticated
  using (public.can_edit_row(workspace_id, created_by));

-- Atlas anatômico (anatomical_structures)

create table public.anatomical_structures (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  name text not null,
  structure_type text default 'musculo' not null,
  body_region text,
  origin text,
  insertion text,
  action text,
  innervation text,
  anatomical_relations text,
  description text,
  references_text text,
  tags text[] default '{}'::text[] not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint anatomical_structures_name_chk0 check (char_length(name) <= 200),
  constraint anatomical_structures_name_chk1 check (char_length(btrim(name)) > 0),
  constraint anatomical_structures_structure_type_chk0 check (char_length(structure_type) <= 64),
  constraint anatomical_structures_structure_type_chk1 check (char_length(btrim(structure_type)) > 0),
  constraint anatomical_structures_structure_type_chk2 check (structure_type is null or structure_type in ('osso', 'musculo', 'articulacao', 'nervo', 'ligamento', 'tendao', 'outro')),
  constraint anatomical_structures_body_region_chk0 check (char_length(body_region) <= 64),
  constraint anatomical_structures_body_region_chk1 check (body_region is null or body_region in ('ombro', 'cotovelo', 'punho_mao', 'coluna_cervical', 'coluna_toracica', 'coluna_lombar', 'quadril', 'joelho', 'tornozelo_pe', 'cabeca_pescoco', 'torax', 'sistemica')),
  constraint anatomical_structures_origin_chk0 check (char_length(origin) <= 20000),
  constraint anatomical_structures_insertion_chk0 check (char_length(insertion) <= 20000),
  constraint anatomical_structures_action_chk0 check (char_length(action) <= 20000),
  constraint anatomical_structures_innervation_chk0 check (char_length(innervation) <= 20000),
  constraint anatomical_structures_anatomical_relations_chk0 check (char_length(anatomical_relations) <= 20000),
  constraint anatomical_structures_description_chk0 check (char_length(description) <= 200000),
  constraint anatomical_structures_references_text_chk0 check (char_length(references_text) <= 200000),
  constraint anatomical_structures_tags_chk0 check (cardinality(tags) <= 50)
);

create index anatomical_structures_ws_idx on public.anatomical_structures (workspace_id, created_at desc);

create trigger anatomical_structures_protect before update on public.anatomical_structures
  for each row execute function public.protect_ownership();

create trigger anatomical_structures_index after insert or update or delete on public.anatomical_structures
  for each row execute function public.tg_index_entity('name', 'structure_type', 'origin', 'insertion', 'action', 'innervation', 'description');

alter table public.anatomical_structures enable row level security;

create policy anatomical_structures_select on public.anatomical_structures for select to authenticated
  using (public.is_workspace_member(workspace_id));

create policy anatomical_structures_insert on public.anatomical_structures for insert to authenticated
  with check (public.can_write_workspace(workspace_id) and created_by = auth.uid());

create policy anatomical_structures_update on public.anatomical_structures for update to authenticated
  using (public.can_edit_row(workspace_id, created_by))
  with check (public.can_edit_row(workspace_id, created_by));

create policy anatomical_structures_delete on public.anatomical_structures for delete to authenticated
  using (public.can_edit_row(workspace_id, created_by));

-- Banco de exercícios (exercises)

create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  name text not null,
  category text,
  therapeutic_goal text,
  body_region text,
  joint text,
  muscle_group text,
  muscles text,
  rehab_phase text,
  starting_position text,
  execution text,
  sets integer,
  repetitions text,
  duration text,
  load text,
  progressions text,
  regressions text,
  indications text,
  contraindications text,
  precautions text,
  video_url text,
  references_text text,
  tags text[] default '{}'::text[] not null,
  is_favorite boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exercises_name_chk0 check (char_length(name) <= 200),
  constraint exercises_name_chk1 check (char_length(btrim(name)) > 0),
  constraint exercises_category_chk0 check (char_length(category) <= 64),
  constraint exercises_category_chk1 check (category is null or category in ('fortalecimento', 'alongamento', 'mobilidade', 'propriocepcao', 'equilibrio', 'aerobico', 'funcional', 'respiratorio', 'neuromotor', 'pliometria', 'outro')),
  constraint exercises_therapeutic_goal_chk0 check (char_length(therapeutic_goal) <= 1000),
  constraint exercises_body_region_chk0 check (char_length(body_region) <= 64),
  constraint exercises_body_region_chk1 check (body_region is null or body_region in ('ombro', 'cotovelo', 'punho_mao', 'coluna_cervical', 'coluna_toracica', 'coluna_lombar', 'quadril', 'joelho', 'tornozelo_pe', 'cabeca_pescoco', 'torax', 'sistemica')),
  constraint exercises_joint_chk0 check (char_length(joint) <= 1000),
  constraint exercises_muscle_group_chk0 check (char_length(muscle_group) <= 1000),
  constraint exercises_muscles_chk0 check (char_length(muscles) <= 20000),
  constraint exercises_rehab_phase_chk0 check (char_length(rehab_phase) <= 64),
  constraint exercises_rehab_phase_chk1 check (rehab_phase is null or rehab_phase in ('aguda', 'subaguda', 'remodelamento', 'retorno_funcional', 'retorno_esporte', 'manutencao')),
  constraint exercises_starting_position_chk0 check (char_length(starting_position) <= 20000),
  constraint exercises_execution_chk0 check (char_length(execution) <= 200000),
  constraint exercises_sets_chk0 check (sets is null or sets >= 0),
  constraint exercises_sets_chk1 check (sets is null or sets <= 100),
  constraint exercises_repetitions_chk0 check (char_length(repetitions) <= 1000),
  constraint exercises_duration_chk0 check (char_length(duration) <= 1000),
  constraint exercises_load_chk0 check (char_length(load) <= 1000),
  constraint exercises_progressions_chk0 check (char_length(progressions) <= 20000),
  constraint exercises_regressions_chk0 check (char_length(regressions) <= 20000),
  constraint exercises_indications_chk0 check (char_length(indications) <= 20000),
  constraint exercises_contraindications_chk0 check (char_length(contraindications) <= 20000),
  constraint exercises_precautions_chk0 check (char_length(precautions) <= 20000),
  constraint exercises_video_url_chk0 check (char_length(video_url) <= 2000),
  constraint exercises_video_url_chk1 check (video_url is null or video_url ~* '^https?://'),
  constraint exercises_references_text_chk0 check (char_length(references_text) <= 200000),
  constraint exercises_tags_chk0 check (cardinality(tags) <= 50)
);

create index exercises_ws_idx on public.exercises (workspace_id, created_at desc);

create trigger exercises_protect before update on public.exercises
  for each row execute function public.protect_ownership();

create trigger exercises_index after insert or update or delete on public.exercises
  for each row execute function public.tg_index_entity('name', 'therapeutic_goal', 'therapeutic_goal', 'muscles', 'execution', 'indications', 'joint');

alter table public.exercises enable row level security;

create policy exercises_select on public.exercises for select to authenticated
  using (public.is_workspace_member(workspace_id));

create policy exercises_insert on public.exercises for insert to authenticated
  with check (public.can_write_workspace(workspace_id) and created_by = auth.uid());

create policy exercises_update on public.exercises for update to authenticated
  using (public.can_edit_row(workspace_id, created_by))
  with check (public.can_edit_row(workspace_id, created_by));

create policy exercises_delete on public.exercises for delete to authenticated
  using (public.can_edit_row(workspace_id, created_by));

-- Testes especiais (clinical_tests)

create table public.clinical_tests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  name text not null,
  test_category text default 'ortopedico' not null,
  body_region text,
  mastery_level text default 'iniciante',
  objective text,
  indications text,
  patient_position text,
  therapist_position text,
  execution text,
  interpretation text,
  sensitivity numeric,
  specificity numeric,
  accuracy_source text,
  limitations text,
  video_url text,
  references_text text,
  tags text[] default '{}'::text[] not null,
  is_favorite boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clinical_tests_name_chk0 check (char_length(name) <= 200),
  constraint clinical_tests_name_chk1 check (char_length(btrim(name)) > 0),
  constraint clinical_tests_test_category_chk0 check (char_length(test_category) <= 64),
  constraint clinical_tests_test_category_chk1 check (char_length(btrim(test_category)) > 0),
  constraint clinical_tests_test_category_chk2 check (test_category is null or test_category in ('ortopedico', 'neurologico', 'funcional', 'cardiovascular', 'respiratorio', 'postural', 'goniometria', 'forca', 'escala_dor', 'escala_funcional')),
  constraint clinical_tests_body_region_chk0 check (char_length(body_region) <= 64),
  constraint clinical_tests_body_region_chk1 check (body_region is null or body_region in ('ombro', 'cotovelo', 'punho_mao', 'coluna_cervical', 'coluna_toracica', 'coluna_lombar', 'quadril', 'joelho', 'tornozelo_pe', 'cabeca_pescoco', 'torax', 'sistemica')),
  constraint clinical_tests_mastery_level_chk0 check (char_length(mastery_level) <= 64),
  constraint clinical_tests_mastery_level_chk1 check (mastery_level is null or mastery_level in ('iniciante', 'basico', 'intermediario', 'avancado')),
  constraint clinical_tests_objective_chk0 check (char_length(objective) <= 20000),
  constraint clinical_tests_indications_chk0 check (char_length(indications) <= 20000),
  constraint clinical_tests_patient_position_chk0 check (char_length(patient_position) <= 20000),
  constraint clinical_tests_therapist_position_chk0 check (char_length(therapist_position) <= 20000),
  constraint clinical_tests_execution_chk0 check (char_length(execution) <= 200000),
  constraint clinical_tests_interpretation_chk0 check (char_length(interpretation) <= 200000),
  constraint clinical_tests_sensitivity_chk0 check (sensitivity is null or sensitivity >= 0),
  constraint clinical_tests_sensitivity_chk1 check (sensitivity is null or sensitivity <= 100),
  constraint clinical_tests_specificity_chk0 check (specificity is null or specificity >= 0),
  constraint clinical_tests_specificity_chk1 check (specificity is null or specificity <= 100),
  constraint clinical_tests_accuracy_source_chk0 check (char_length(accuracy_source) <= 20000),
  constraint clinical_tests_limitations_chk0 check (char_length(limitations) <= 20000),
  constraint clinical_tests_video_url_chk0 check (char_length(video_url) <= 2000),
  constraint clinical_tests_video_url_chk1 check (video_url is null or video_url ~* '^https?://'),
  constraint clinical_tests_references_text_chk0 check (char_length(references_text) <= 200000),
  constraint clinical_tests_tags_chk0 check (cardinality(tags) <= 50),
  constraint clinical_tests_accuracy_source check ((sensitivity is null and specificity is null) or coalesce(length(trim(accuracy_source)), 0) > 0)
);

create index clinical_tests_ws_idx on public.clinical_tests (workspace_id, created_at desc);

create trigger clinical_tests_protect before update on public.clinical_tests
  for each row execute function public.protect_ownership();

create trigger clinical_tests_index after insert or update or delete on public.clinical_tests
  for each row execute function public.tg_index_entity('name', 'objective', 'objective', 'indications', 'execution', 'interpretation');

alter table public.clinical_tests enable row level security;

create policy clinical_tests_select on public.clinical_tests for select to authenticated
  using (public.is_workspace_member(workspace_id));

create policy clinical_tests_insert on public.clinical_tests for insert to authenticated
  with check (public.can_write_workspace(workspace_id) and created_by = auth.uid());

create policy clinical_tests_update on public.clinical_tests for update to authenticated
  using (public.can_edit_row(workspace_id, created_by))
  with check (public.can_edit_row(workspace_id, created_by));

create policy clinical_tests_delete on public.clinical_tests for delete to authenticated
  using (public.can_edit_row(workspace_id, created_by));

-- Protocolos clínicos (protocols)

create table public.protocols (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  name text not null,
  specialty text,
  objective text,
  indications text,
  steps text,
  references_text text,
  reviewed_at date,
  tags text[] default '{}'::text[] not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint protocols_name_chk0 check (char_length(name) <= 200),
  constraint protocols_name_chk1 check (char_length(btrim(name)) > 0),
  constraint protocols_specialty_chk0 check (char_length(specialty) <= 64),
  constraint protocols_specialty_chk1 check (specialty is null or specialty in ('traumato_ortopedia', 'neurofuncional', 'cardiovascular', 'respiratoria', 'esportiva', 'pediatrica', 'gerontologia', 'saude_mulher', 'outra')),
  constraint protocols_objective_chk0 check (char_length(objective) <= 20000),
  constraint protocols_indications_chk0 check (char_length(indications) <= 20000),
  constraint protocols_steps_chk0 check (char_length(steps) <= 200000),
  constraint protocols_references_text_chk0 check (char_length(references_text) <= 200000),
  constraint protocols_tags_chk0 check (cardinality(tags) <= 50)
);

create index protocols_ws_idx on public.protocols (workspace_id, created_at desc);

create trigger protocols_protect before update on public.protocols
  for each row execute function public.protect_ownership();

create trigger protocols_index after insert or update or delete on public.protocols
  for each row execute function public.tg_index_entity('name', 'objective', 'objective', 'indications', 'steps');

alter table public.protocols enable row level security;

create policy protocols_select on public.protocols for select to authenticated
  using (public.is_workspace_member(workspace_id));

create policy protocols_insert on public.protocols for insert to authenticated
  with check (public.can_write_workspace(workspace_id) and created_by = auth.uid());

create policy protocols_update on public.protocols for update to authenticated
  using (public.can_edit_row(workspace_id, created_by))
  with check (public.can_edit_row(workspace_id, created_by));

create policy protocols_delete on public.protocols for delete to authenticated
  using (public.can_edit_row(workspace_id, created_by));

-- Farmacologia (medications)

create table public.medications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  name text not null,
  drug_class text,
  mechanism_of_action text,
  pt_relevant_effects text,
  precautions text,
  references_text text,
  tags text[] default '{}'::text[] not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint medications_name_chk0 check (char_length(name) <= 200),
  constraint medications_name_chk1 check (char_length(btrim(name)) > 0),
  constraint medications_drug_class_chk0 check (char_length(drug_class) <= 1000),
  constraint medications_mechanism_of_action_chk0 check (char_length(mechanism_of_action) <= 20000),
  constraint medications_pt_relevant_effects_chk0 check (char_length(pt_relevant_effects) <= 20000),
  constraint medications_precautions_chk0 check (char_length(precautions) <= 20000),
  constraint medications_references_text_chk0 check (char_length(references_text) <= 200000),
  constraint medications_tags_chk0 check (cardinality(tags) <= 50)
);

create index medications_ws_idx on public.medications (workspace_id, created_at desc);

create trigger medications_protect before update on public.medications
  for each row execute function public.protect_ownership();

create trigger medications_index after insert or update or delete on public.medications
  for each row execute function public.tg_index_entity('name', 'drug_class', 'drug_class', 'mechanism_of_action', 'pt_relevant_effects');

alter table public.medications enable row level security;

create policy medications_select on public.medications for select to authenticated
  using (public.is_workspace_member(workspace_id));

create policy medications_insert on public.medications for insert to authenticated
  with check (public.can_write_workspace(workspace_id) and created_by = auth.uid());

create policy medications_update on public.medications for update to authenticated
  using (public.can_edit_row(workspace_id, created_by))
  with check (public.can_edit_row(workspace_id, created_by));

create policy medications_delete on public.medications for delete to authenticated
  using (public.can_edit_row(workspace_id, created_by));

-- Casos clínicos (clinical_cases)

create table public.clinical_cases (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  case_code text not null,
  title text,
  case_date date,
  age_range text,
  sex text default 'nao_informado',
  context text,
  specialty text,
  status text default 'em_andamento',
  is_real_case boolean default false not null,
  anonymization_confirmed boolean default false not null,
  chief_complaint text,
  hda text,
  hpp text,
  family_history text,
  inspection text,
  palpation text,
  range_of_motion text,
  muscle_strength text,
  functional_assessment text,
  special_tests text,
  scales text,
  clinical_findings text,
  kinetic_functional_diagnosis text,
  identified_problems text,
  short_term_goals text,
  long_term_goals text,
  therapeutic_plan text,
  scientific_justification text,
  critical_reflection text,
  tags text[] default '{}'::text[] not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clinical_cases_case_code_chk0 check (char_length(case_code) <= 40),
  constraint clinical_cases_case_code_chk1 check (char_length(btrim(case_code)) > 0),
  constraint clinical_cases_title_chk0 check (char_length(title) <= 200),
  constraint clinical_cases_age_range_chk0 check (char_length(age_range) <= 64),
  constraint clinical_cases_age_range_chk1 check (age_range is null or age_range in ('0-11', '12-17', '18-29', '30-44', '45-59', '60-74', '75+')),
  constraint clinical_cases_sex_chk0 check (char_length(sex) <= 64),
  constraint clinical_cases_sex_chk1 check (sex is null or sex in ('nao_informado', 'feminino', 'masculino', 'outro')),
  constraint clinical_cases_context_chk0 check (char_length(context) <= 64),
  constraint clinical_cases_context_chk1 check (context is null or context in ('estagio', 'aula', 'liga', 'literatura', 'simulado')),
  constraint clinical_cases_specialty_chk0 check (char_length(specialty) <= 64),
  constraint clinical_cases_specialty_chk1 check (specialty is null or specialty in ('traumato_ortopedia', 'neurofuncional', 'cardiovascular', 'respiratoria', 'esportiva', 'pediatrica', 'gerontologia', 'saude_mulher', 'outra')),
  constraint clinical_cases_status_chk0 check (char_length(status) <= 64),
  constraint clinical_cases_status_chk1 check (status is null or status in ('em_andamento', 'concluido', 'arquivado')),
  constraint clinical_cases_chief_complaint_chk0 check (char_length(chief_complaint) <= 20000),
  constraint clinical_cases_hda_chk0 check (char_length(hda) <= 20000),
  constraint clinical_cases_hpp_chk0 check (char_length(hpp) <= 20000),
  constraint clinical_cases_family_history_chk0 check (char_length(family_history) <= 20000),
  constraint clinical_cases_inspection_chk0 check (char_length(inspection) <= 20000),
  constraint clinical_cases_palpation_chk0 check (char_length(palpation) <= 20000),
  constraint clinical_cases_range_of_motion_chk0 check (char_length(range_of_motion) <= 20000),
  constraint clinical_cases_muscle_strength_chk0 check (char_length(muscle_strength) <= 20000),
  constraint clinical_cases_functional_assessment_chk0 check (char_length(functional_assessment) <= 20000),
  constraint clinical_cases_special_tests_chk0 check (char_length(special_tests) <= 20000),
  constraint clinical_cases_scales_chk0 check (char_length(scales) <= 20000),
  constraint clinical_cases_clinical_findings_chk0 check (char_length(clinical_findings) <= 20000),
  constraint clinical_cases_kinetic_functional_diagnosis_chk0 check (char_length(kinetic_functional_diagnosis) <= 20000),
  constraint clinical_cases_identified_problems_chk0 check (char_length(identified_problems) <= 20000),
  constraint clinical_cases_short_term_goals_chk0 check (char_length(short_term_goals) <= 20000),
  constraint clinical_cases_long_term_goals_chk0 check (char_length(long_term_goals) <= 20000),
  constraint clinical_cases_therapeutic_plan_chk0 check (char_length(therapeutic_plan) <= 200000),
  constraint clinical_cases_scientific_justification_chk0 check (char_length(scientific_justification) <= 200000),
  constraint clinical_cases_critical_reflection_chk0 check (char_length(critical_reflection) <= 200000),
  constraint clinical_cases_tags_chk0 check (cardinality(tags) <= 50),
  constraint clinical_cases_anonymized check (not is_real_case or anonymization_confirmed)
);

create index clinical_cases_ws_idx on public.clinical_cases (workspace_id, created_at desc);

create index clinical_cases_status_idx on public.clinical_cases (workspace_id, status);

create trigger clinical_cases_protect before update on public.clinical_cases
  for each row execute function public.protect_ownership();

create trigger clinical_cases_index after insert or update or delete on public.clinical_cases
  for each row execute function public.tg_index_entity('case_code', 'title', 'title', 'chief_complaint', 'clinical_findings', 'kinetic_functional_diagnosis', 'therapeutic_plan');

alter table public.clinical_cases enable row level security;

create policy clinical_cases_select on public.clinical_cases for select to authenticated
  using (public.is_workspace_member(workspace_id));

create policy clinical_cases_insert on public.clinical_cases for insert to authenticated
  with check (public.can_write_workspace(workspace_id) and created_by = auth.uid());

create policy clinical_cases_update on public.clinical_cases for update to authenticated
  using (public.can_edit_row(workspace_id, created_by))
  with check (public.can_edit_row(workspace_id, created_by));

create policy clinical_cases_delete on public.clinical_cases for delete to authenticated
  using (public.can_edit_row(workspace_id, created_by));

-- Avaliações clínicas (clinical_assessments)

create table public.clinical_assessments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  case_id uuid not null,
  title text not null,
  assessment_date date,
  assessment_type text default 'reavaliacao',
  findings text,
  range_of_motion text,
  muscle_strength text,
  functional_assessment text,
  tests_applied text,
  scales_results text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clinical_assessments_title_chk0 check (char_length(title) <= 200),
  constraint clinical_assessments_title_chk1 check (char_length(btrim(title)) > 0),
  constraint clinical_assessments_assessment_type_chk0 check (char_length(assessment_type) <= 64),
  constraint clinical_assessments_assessment_type_chk1 check (assessment_type is null or assessment_type in ('inicial', 'reavaliacao', 'alta')),
  constraint clinical_assessments_findings_chk0 check (char_length(findings) <= 20000),
  constraint clinical_assessments_range_of_motion_chk0 check (char_length(range_of_motion) <= 20000),
  constraint clinical_assessments_muscle_strength_chk0 check (char_length(muscle_strength) <= 20000),
  constraint clinical_assessments_functional_assessment_chk0 check (char_length(functional_assessment) <= 20000),
  constraint clinical_assessments_tests_applied_chk0 check (char_length(tests_applied) <= 20000),
  constraint clinical_assessments_scales_results_chk0 check (char_length(scales_results) <= 20000),
  constraint clinical_assessments_notes_chk0 check (char_length(notes) <= 20000)
);

create index clinical_assessments_ws_idx on public.clinical_assessments (workspace_id, created_at desc);

create index clinical_assessments_case_id_idx on public.clinical_assessments (case_id);

create index clinical_assessments_assessment_date_idx on public.clinical_assessments (workspace_id, assessment_date);

create trigger clinical_assessments_protect before update on public.clinical_assessments
  for each row execute function public.protect_ownership();

create or replace function public.tg_clinical_assessments_refs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.case_id is distinct from old.case_id then
    perform public.assert_same_workspace('clinical_cases', new.case_id, new.workspace_id);
  end if;
  return new;
end;
$$;

create trigger clinical_assessments_refs before insert or update on public.clinical_assessments
  for each row execute function public.tg_clinical_assessments_refs();

create trigger clinical_assessments_index after insert or update or delete on public.clinical_assessments
  for each row execute function public.tg_index_entity('title', '', 'findings', 'tests_applied', 'scales_results');

alter table public.clinical_assessments enable row level security;

create policy clinical_assessments_select on public.clinical_assessments for select to authenticated
  using (public.is_workspace_member(workspace_id));

create policy clinical_assessments_insert on public.clinical_assessments for insert to authenticated
  with check (public.can_write_workspace(workspace_id) and created_by = auth.uid());

create policy clinical_assessments_update on public.clinical_assessments for update to authenticated
  using (public.can_edit_row(workspace_id, created_by))
  with check (public.can_edit_row(workspace_id, created_by));

create policy clinical_assessments_delete on public.clinical_assessments for delete to authenticated
  using (public.can_edit_row(workspace_id, created_by));

-- Planejamento terapêutico (clinical_plans)

create table public.clinical_plans (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  case_id uuid not null,
  title text not null,
  start_date date,
  status text default 'ativo',
  diagnosis text,
  problems text,
  short_term_goals text,
  long_term_goals text,
  plan text,
  justification text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clinical_plans_title_chk0 check (char_length(title) <= 200),
  constraint clinical_plans_title_chk1 check (char_length(btrim(title)) > 0),
  constraint clinical_plans_status_chk0 check (char_length(status) <= 64),
  constraint clinical_plans_status_chk1 check (status is null or status in ('ativo', 'revisado', 'encerrado')),
  constraint clinical_plans_diagnosis_chk0 check (char_length(diagnosis) <= 20000),
  constraint clinical_plans_problems_chk0 check (char_length(problems) <= 20000),
  constraint clinical_plans_short_term_goals_chk0 check (char_length(short_term_goals) <= 20000),
  constraint clinical_plans_long_term_goals_chk0 check (char_length(long_term_goals) <= 20000),
  constraint clinical_plans_plan_chk0 check (char_length(plan) <= 200000),
  constraint clinical_plans_justification_chk0 check (char_length(justification) <= 200000)
);

create index clinical_plans_ws_idx on public.clinical_plans (workspace_id, created_at desc);

create index clinical_plans_case_id_idx on public.clinical_plans (case_id);

create index clinical_plans_status_idx on public.clinical_plans (workspace_id, status);

create trigger clinical_plans_protect before update on public.clinical_plans
  for each row execute function public.protect_ownership();

create or replace function public.tg_clinical_plans_refs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.case_id is distinct from old.case_id then
    perform public.assert_same_workspace('clinical_cases', new.case_id, new.workspace_id);
  end if;
  return new;
end;
$$;

create trigger clinical_plans_refs before insert or update on public.clinical_plans
  for each row execute function public.tg_clinical_plans_refs();

create trigger clinical_plans_index after insert or update or delete on public.clinical_plans
  for each row execute function public.tg_index_entity('title', '', 'diagnosis', 'plan', 'justification');

alter table public.clinical_plans enable row level security;

create policy clinical_plans_select on public.clinical_plans for select to authenticated
  using (public.is_workspace_member(workspace_id));

create policy clinical_plans_insert on public.clinical_plans for insert to authenticated
  with check (public.can_write_workspace(workspace_id) and created_by = auth.uid());

create policy clinical_plans_update on public.clinical_plans for update to authenticated
  using (public.can_edit_row(workspace_id, created_by))
  with check (public.can_edit_row(workspace_id, created_by));

create policy clinical_plans_delete on public.clinical_plans for delete to authenticated
  using (public.can_edit_row(workspace_id, created_by));

-- Intervenções (clinical_interventions)

create table public.clinical_interventions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  case_id uuid not null,
  technique text not null,
  exercise_id uuid,
  intervention_date date,
  description text,
  sets integer,
  repetitions text,
  load text,
  frequency text,
  progression text,
  response text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clinical_interventions_technique_chk0 check (char_length(technique) <= 200),
  constraint clinical_interventions_technique_chk1 check (char_length(btrim(technique)) > 0),
  constraint clinical_interventions_description_chk0 check (char_length(description) <= 20000),
  constraint clinical_interventions_sets_chk0 check (sets is null or sets >= 0),
  constraint clinical_interventions_sets_chk1 check (sets is null or sets <= 100),
  constraint clinical_interventions_repetitions_chk0 check (char_length(repetitions) <= 1000),
  constraint clinical_interventions_load_chk0 check (char_length(load) <= 1000),
  constraint clinical_interventions_frequency_chk0 check (char_length(frequency) <= 1000),
  constraint clinical_interventions_progression_chk0 check (char_length(progression) <= 20000),
  constraint clinical_interventions_response_chk0 check (char_length(response) <= 20000)
);

create index clinical_interventions_ws_idx on public.clinical_interventions (workspace_id, created_at desc);

create index clinical_interventions_case_id_idx on public.clinical_interventions (case_id);

create index clinical_interventions_exercise_id_idx on public.clinical_interventions (exercise_id);

create index clinical_interventions_intervention_date_idx on public.clinical_interventions (workspace_id, intervention_date);

create trigger clinical_interventions_protect before update on public.clinical_interventions
  for each row execute function public.protect_ownership();

create or replace function public.tg_clinical_interventions_refs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.case_id is distinct from old.case_id then
    perform public.assert_same_workspace('clinical_cases', new.case_id, new.workspace_id);
  end if;
  if tg_op = 'INSERT' or new.exercise_id is distinct from old.exercise_id then
    perform public.assert_same_workspace('exercises', new.exercise_id, new.workspace_id);
  end if;
  return new;
end;
$$;

create trigger clinical_interventions_refs before insert or update on public.clinical_interventions
  for each row execute function public.tg_clinical_interventions_refs();

create trigger clinical_interventions_index after insert or update or delete on public.clinical_interventions
  for each row execute function public.tg_index_entity('technique', '', 'description', 'response');

alter table public.clinical_interventions enable row level security;

create policy clinical_interventions_select on public.clinical_interventions for select to authenticated
  using (public.is_workspace_member(workspace_id));

create policy clinical_interventions_insert on public.clinical_interventions for insert to authenticated
  with check (public.can_write_workspace(workspace_id) and created_by = auth.uid());

create policy clinical_interventions_update on public.clinical_interventions for update to authenticated
  using (public.can_edit_row(workspace_id, created_by))
  with check (public.can_edit_row(workspace_id, created_by));

create policy clinical_interventions_delete on public.clinical_interventions for delete to authenticated
  using (public.can_edit_row(workspace_id, created_by));

-- Evoluções (clinical_evolutions)

create table public.clinical_evolutions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  case_id uuid not null,
  title text not null,
  evolution_date date not null,
  description text,
  results text,
  adjustments text,
  reflection text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clinical_evolutions_title_chk0 check (char_length(title) <= 200),
  constraint clinical_evolutions_title_chk1 check (char_length(btrim(title)) > 0),
  constraint clinical_evolutions_description_chk0 check (char_length(description) <= 200000),
  constraint clinical_evolutions_results_chk0 check (char_length(results) <= 20000),
  constraint clinical_evolutions_adjustments_chk0 check (char_length(adjustments) <= 20000),
  constraint clinical_evolutions_reflection_chk0 check (char_length(reflection) <= 20000)
);

create index clinical_evolutions_ws_idx on public.clinical_evolutions (workspace_id, created_at desc);

create index clinical_evolutions_case_id_idx on public.clinical_evolutions (case_id);

create index clinical_evolutions_evolution_date_idx on public.clinical_evolutions (workspace_id, evolution_date);

create trigger clinical_evolutions_protect before update on public.clinical_evolutions
  for each row execute function public.protect_ownership();

create or replace function public.tg_clinical_evolutions_refs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.case_id is distinct from old.case_id then
    perform public.assert_same_workspace('clinical_cases', new.case_id, new.workspace_id);
  end if;
  return new;
end;
$$;

create trigger clinical_evolutions_refs before insert or update on public.clinical_evolutions
  for each row execute function public.tg_clinical_evolutions_refs();

create trigger clinical_evolutions_index after insert or update or delete on public.clinical_evolutions
  for each row execute function public.tg_index_entity('title', '', 'description', 'results', 'adjustments', 'reflection');

alter table public.clinical_evolutions enable row level security;

create policy clinical_evolutions_select on public.clinical_evolutions for select to authenticated
  using (public.is_workspace_member(workspace_id));

create policy clinical_evolutions_insert on public.clinical_evolutions for insert to authenticated
  with check (public.can_write_workspace(workspace_id) and created_by = auth.uid());

create policy clinical_evolutions_update on public.clinical_evolutions for update to authenticated
  using (public.can_edit_row(workspace_id, created_by))
  with check (public.can_edit_row(workspace_id, created_by));

create policy clinical_evolutions_delete on public.clinical_evolutions for delete to authenticated
  using (public.can_edit_row(workspace_id, created_by));

-- Flashcards (flashcards)

create table public.flashcards (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  front text not null,
  back text not null,
  subject_id uuid,
  topic text,
  difficulty text default 'medio',
  ease_factor numeric(4,2) not null default 2.5,
  interval_days integer not null default 0,
  repetitions_count integer not null default 0,
  next_review_at timestamptz not null default now(),
  last_reviewed_at timestamptz,
  correct_count integer not null default 0,
  wrong_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint flashcards_front_chk0 check (char_length(front) <= 200000),
  constraint flashcards_front_chk1 check (char_length(btrim(front)) > 0),
  constraint flashcards_back_chk0 check (char_length(back) <= 200000),
  constraint flashcards_back_chk1 check (char_length(btrim(back)) > 0),
  constraint flashcards_topic_chk0 check (char_length(topic) <= 1000),
  constraint flashcards_difficulty_chk0 check (char_length(difficulty) <= 64),
  constraint flashcards_difficulty_chk1 check (difficulty is null or difficulty in ('facil', 'medio', 'dificil'))
);

create index flashcards_ws_idx on public.flashcards (workspace_id, created_at desc);

create index flashcards_subject_id_idx on public.flashcards (subject_id);

create trigger flashcards_protect before update on public.flashcards
  for each row execute function public.protect_ownership();

create or replace function public.tg_flashcards_refs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.subject_id is distinct from old.subject_id then
    perform public.assert_same_workspace('subjects', new.subject_id, new.workspace_id);
  end if;
  return new;
end;
$$;

create trigger flashcards_refs before insert or update on public.flashcards
  for each row execute function public.tg_flashcards_refs();

create trigger flashcards_index after insert or update or delete on public.flashcards
  for each row execute function public.tg_index_entity('front', 'topic', 'back', 'topic');

alter table public.flashcards enable row level security;

create policy flashcards_select on public.flashcards for select to authenticated
  using (public.is_workspace_member(workspace_id));

create policy flashcards_insert on public.flashcards for insert to authenticated
  with check (public.can_write_workspace(workspace_id) and created_by = auth.uid());

create policy flashcards_update on public.flashcards for update to authenticated
  using (public.can_edit_row(workspace_id, created_by))
  with check (public.can_edit_row(workspace_id, created_by));

create policy flashcards_delete on public.flashcards for delete to authenticated
  using (public.can_edit_row(workspace_id, created_by));

-- Banco de questões (questions)

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  statement text not null,
  question_type text default 'objetiva' not null,
  subject_id uuid,
  topic text,
  difficulty text default 'medio',
  options jsonb default '[]'::jsonb not null,
  correct_option integer,
  expected_answer text,
  explanation text,
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint questions_statement_chk0 check (char_length(statement) <= 200000),
  constraint questions_statement_chk1 check (char_length(btrim(statement)) > 0),
  constraint questions_question_type_chk0 check (char_length(question_type) <= 64),
  constraint questions_question_type_chk1 check (char_length(btrim(question_type)) > 0),
  constraint questions_question_type_chk2 check (question_type is null or question_type in ('objetiva', 'discursiva')),
  constraint questions_topic_chk0 check (char_length(topic) <= 1000),
  constraint questions_difficulty_chk0 check (char_length(difficulty) <= 64),
  constraint questions_difficulty_chk1 check (difficulty is null or difficulty in ('facil', 'medio', 'dificil')),
  constraint questions_options_chk0 check (jsonb_typeof(options) = 'array'),
  constraint questions_correct_option_chk0 check (correct_option is null or correct_option >= 0),
  constraint questions_correct_option_chk1 check (correct_option is null or correct_option <= 9),
  constraint questions_expected_answer_chk0 check (char_length(expected_answer) <= 200000),
  constraint questions_explanation_chk0 check (char_length(explanation) <= 200000),
  constraint questions_source_chk0 check (char_length(source) <= 20000),
  constraint questions_objective_has_answer check (question_type <> 'objetiva' or (jsonb_array_length(coalesce(options, '[]'::jsonb)) >= 2 and correct_option is not null and correct_option < jsonb_array_length(options)))
);

create index questions_ws_idx on public.questions (workspace_id, created_at desc);

create index questions_subject_id_idx on public.questions (subject_id);

create trigger questions_protect before update on public.questions
  for each row execute function public.protect_ownership();

create or replace function public.tg_questions_refs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.subject_id is distinct from old.subject_id then
    perform public.assert_same_workspace('subjects', new.subject_id, new.workspace_id);
  end if;
  return new;
end;
$$;

create trigger questions_refs before insert or update on public.questions
  for each row execute function public.tg_questions_refs();

create trigger questions_index after insert or update or delete on public.questions
  for each row execute function public.tg_index_entity('statement', 'topic', 'topic', 'explanation', 'expected_answer');

alter table public.questions enable row level security;

create policy questions_select on public.questions for select to authenticated
  using (public.is_workspace_member(workspace_id));

create policy questions_insert on public.questions for insert to authenticated
  with check (public.can_write_workspace(workspace_id) and created_by = auth.uid());

create policy questions_update on public.questions for update to authenticated
  using (public.can_edit_row(workspace_id, created_by))
  with check (public.can_edit_row(workspace_id, created_by));

create policy questions_delete on public.questions for delete to authenticated
  using (public.can_edit_row(workspace_id, created_by));

-- Trabalhos e projetos (projects)

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  name text not null,
  project_type text default 'trabalho_academico' not null,
  status text default 'nao_iniciado',
  subject_id uuid,
  description text,
  objective text,
  responsible text,
  start_date date,
  due_date date,
  references_text text,
  notes text,
  tags text[] default '{}'::text[] not null,
  is_favorite boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint projects_name_chk0 check (char_length(name) <= 200),
  constraint projects_name_chk1 check (char_length(btrim(name)) > 0),
  constraint projects_project_type_chk0 check (char_length(project_type) <= 64),
  constraint projects_project_type_chk1 check (char_length(btrim(project_type)) > 0),
  constraint projects_project_type_chk2 check (project_type is null or project_type in ('trabalho_academico', 'seminario', 'projeto_cientifico', 'projeto_pesquisa', 'revisao_integrativa', 'revisao_sistematica', 'artigo_original', 'relatorio', 'apresentacao', 'resumo_cientifico', 'extensao', 'tcc')),
  constraint projects_status_chk0 check (char_length(status) <= 64),
  constraint projects_status_chk1 check (status is null or status in ('nao_iniciado', 'em_andamento', 'em_revisao', 'concluido')),
  constraint projects_description_chk0 check (char_length(description) <= 20000),
  constraint projects_objective_chk0 check (char_length(objective) <= 20000),
  constraint projects_responsible_chk0 check (char_length(responsible) <= 1000),
  constraint projects_references_text_chk0 check (char_length(references_text) <= 200000),
  constraint projects_notes_chk0 check (char_length(notes) <= 20000),
  constraint projects_tags_chk0 check (cardinality(tags) <= 50),
  constraint projects_dates check (due_date is null or start_date is null or due_date >= start_date)
);

create index projects_ws_idx on public.projects (workspace_id, created_at desc);

create index projects_subject_id_idx on public.projects (subject_id);

create index projects_due_date_idx on public.projects (workspace_id, due_date);

create index projects_status_idx on public.projects (workspace_id, status);

create trigger projects_protect before update on public.projects
  for each row execute function public.protect_ownership();

create or replace function public.tg_projects_refs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.subject_id is distinct from old.subject_id then
    perform public.assert_same_workspace('subjects', new.subject_id, new.workspace_id);
  end if;
  return new;
end;
$$;

create trigger projects_refs before insert or update on public.projects
  for each row execute function public.tg_projects_refs();

create trigger projects_index after insert or update or delete on public.projects
  for each row execute function public.tg_index_entity('name', 'project_type', 'description', 'objective', 'responsible', 'notes');

alter table public.projects enable row level security;

create policy projects_select on public.projects for select to authenticated
  using (public.is_workspace_member(workspace_id));

create policy projects_insert on public.projects for insert to authenticated
  with check (public.can_write_workspace(workspace_id) and created_by = auth.uid());

create policy projects_update on public.projects for update to authenticated
  using (public.can_edit_row(workspace_id, created_by))
  with check (public.can_edit_row(workspace_id, created_by));

create policy projects_delete on public.projects for delete to authenticated
  using (public.can_edit_row(workspace_id, created_by));

-- Projetos e atividades da liga (league_activities)

create table public.league_activities (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  title text not null,
  activity_type text default 'projeto_cientifico' not null,
  starts_at timestamptz,
  ends_at timestamptz,
  location text,
  speaker text,
  body_region text,
  status text default 'planejada',
  hours numeric,
  description text,
  minutes text,
  attendees text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint league_activities_title_chk0 check (char_length(title) <= 200),
  constraint league_activities_title_chk1 check (char_length(btrim(title)) > 0),
  constraint league_activities_activity_type_chk0 check (char_length(activity_type) <= 64),
  constraint league_activities_activity_type_chk1 check (char_length(btrim(activity_type)) > 0),
  constraint league_activities_activity_type_chk2 check (activity_type is null or activity_type in ('projeto_cientifico', 'projeto_extensao', 'outro')),
  constraint league_activities_location_chk0 check (char_length(location) <= 1000),
  constraint league_activities_speaker_chk0 check (char_length(speaker) <= 1000),
  constraint league_activities_body_region_chk0 check (char_length(body_region) <= 64),
  constraint league_activities_body_region_chk1 check (body_region is null or body_region in ('ombro', 'cotovelo', 'punho_mao', 'coluna_cervical', 'coluna_toracica', 'coluna_lombar', 'quadril', 'joelho', 'tornozelo_pe', 'cabeca_pescoco', 'torax', 'sistemica')),
  constraint league_activities_status_chk0 check (char_length(status) <= 64),
  constraint league_activities_status_chk1 check (status is null or status in ('planejada', 'realizada', 'cancelada')),
  constraint league_activities_hours_chk0 check (hours is null or hours >= 0),
  constraint league_activities_hours_chk1 check (hours is null or hours <= 1000),
  constraint league_activities_description_chk0 check (char_length(description) <= 20000),
  constraint league_activities_minutes_chk0 check (char_length(minutes) <= 200000),
  constraint league_activities_attendees_chk0 check (char_length(attendees) <= 20000),
  constraint league_activities_dates check (ends_at is null or starts_at is null or ends_at >= starts_at)
);

create index league_activities_ws_idx on public.league_activities (workspace_id, created_at desc);

create index league_activities_starts_at_idx on public.league_activities (workspace_id, starts_at);

create index league_activities_status_idx on public.league_activities (workspace_id, status);

create trigger league_activities_protect before update on public.league_activities
  for each row execute function public.protect_ownership();

create trigger league_activities_index after insert or update or delete on public.league_activities
  for each row execute function public.tg_index_entity('title', 'speaker', 'speaker', 'description', 'minutes', 'location');

alter table public.league_activities enable row level security;

create policy league_activities_select on public.league_activities for select to authenticated
  using (public.is_workspace_member(workspace_id));

create policy league_activities_insert on public.league_activities for insert to authenticated
  with check (public.can_write_workspace(workspace_id) and created_by = auth.uid());

create policy league_activities_update on public.league_activities for update to authenticated
  using (public.can_edit_row(workspace_id, created_by))
  with check (public.can_edit_row(workspace_id, created_by));

create policy league_activities_delete on public.league_activities for delete to authenticated
  using (public.can_edit_row(workspace_id, created_by));

-- Chaves estrangeiras entre tabelas de conteúdo

alter table public.subjects
  add constraint subjects_semester_id_fkey foreign key (semester_id) references public.semesters (id) on delete set null;
alter table public.subjects
  add constraint subjects_professor_id_fkey foreign key (professor_id) references public.professors (id) on delete set null;

alter table public.library_folders
  add constraint library_folders_parent_id_fkey foreign key (parent_id) references public.library_folders (id) on delete cascade;
alter table public.library_folders
  add constraint library_folders_subject_id_fkey foreign key (subject_id) references public.subjects (id) on delete set null;

alter table public.study_notes
  add constraint study_notes_subject_id_fkey foreign key (subject_id) references public.subjects (id) on delete set null;

alter table public.events
  add constraint events_subject_id_fkey foreign key (subject_id) references public.subjects (id) on delete set null;
alter table public.events
  add constraint events_project_id_fkey foreign key (project_id) references public.projects (id) on delete set null;

alter table public.tasks
  add constraint tasks_subject_id_fkey foreign key (subject_id) references public.subjects (id) on delete set null;
alter table public.tasks
  add constraint tasks_project_id_fkey foreign key (project_id) references public.projects (id) on delete set null;

alter table public.assessments
  add constraint assessments_subject_id_fkey foreign key (subject_id) references public.subjects (id) on delete set null;

alter table public.article_notes
  add constraint article_notes_article_id_fkey foreign key (article_id) references public.articles (id) on delete cascade;

alter table public.citations
  add constraint citations_article_id_fkey foreign key (article_id) references public.articles (id) on delete set null;

alter table public.clinical_assessments
  add constraint clinical_assessments_case_id_fkey foreign key (case_id) references public.clinical_cases (id) on delete cascade;

alter table public.clinical_plans
  add constraint clinical_plans_case_id_fkey foreign key (case_id) references public.clinical_cases (id) on delete cascade;

alter table public.clinical_interventions
  add constraint clinical_interventions_case_id_fkey foreign key (case_id) references public.clinical_cases (id) on delete cascade;
alter table public.clinical_interventions
  add constraint clinical_interventions_exercise_id_fkey foreign key (exercise_id) references public.exercises (id) on delete set null;

alter table public.clinical_evolutions
  add constraint clinical_evolutions_case_id_fkey foreign key (case_id) references public.clinical_cases (id) on delete cascade;

alter table public.flashcards
  add constraint flashcards_subject_id_fkey foreign key (subject_id) references public.subjects (id) on delete set null;

alter table public.questions
  add constraint questions_subject_id_fkey foreign key (subject_id) references public.subjects (id) on delete set null;

alter table public.projects
  add constraint projects_subject_id_fkey foreign key (subject_id) references public.subjects (id) on delete set null;


-- >>> supabase/migrations/20260101000003_documents_studies_extras.sql
-- =====================================================================
-- Migration 0003: documentos/arquivos, tabelas de apoio (coleções,
-- etapas de projeto, revisão espaçada, simulados, liga), notificações
-- automáticas e Storage.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Documentos (arquivos da biblioteca; anexos via entity_links)
-- ---------------------------------------------------------------------

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  title text not null check (char_length(btrim(title)) between 1 and 300),
  description text check (char_length(description) <= 5000),
  file_name text not null check (char_length(file_name) between 1 and 255),
  storage_path text not null unique check (char_length(storage_path) <= 600),
  mime_type text not null check (mime_type in (
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/png',
    'image/jpeg'
  )),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 52428800),
  category text not null default 'material'
    check (category in ('material', 'slide', 'artigo', 'livro', 'imagem', 'certificado', 'documento', 'outro')),
  folder_id uuid references public.library_folders (id) on delete set null,
  subject_id uuid references public.subjects (id) on delete set null,
  is_favorite boolean not null default false,
  tags text[] not null default '{}'::text[] check (cardinality(tags) <= 50),
  upload_status text not null default 'pendente' check (upload_status in ('pendente', 'enviado')),
  processing_status text not null default 'aguardando'
    check (processing_status in ('aguardando', 'processando', 'concluido', 'falha', 'nao_suportado')),
  processing_error text check (char_length(processing_error) <= 2000),
  page_count integer check (page_count is null or page_count >= 0),
  chunk_count integer not null default 0,
  indexed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint documents_path_in_workspace check (storage_path like workspace_id::text || '/%')
);

create index documents_ws_idx on public.documents (workspace_id, created_at desc);
create index documents_folder_idx on public.documents (folder_id);
create index documents_subject_idx on public.documents (subject_id);
create index documents_status_idx on public.documents (workspace_id, processing_status);

create trigger documents_protect before update on public.documents
  for each row execute function public.protect_ownership();

create or replace function public.tg_documents_refs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.folder_id is distinct from old.folder_id then
    perform public.assert_same_workspace('library_folders', new.folder_id, new.workspace_id);
  end if;
  if tg_op = 'INSERT' or new.subject_id is distinct from old.subject_id then
    perform public.assert_same_workspace('subjects', new.subject_id, new.workspace_id);
  end if;
  if tg_op = 'UPDATE' and new.storage_path is distinct from old.storage_path then
    raise exception 'storage_path é imutável';
  end if;
  return new;
end;
$$;
create trigger documents_refs before insert or update on public.documents
  for each row execute function public.tg_documents_refs();

create trigger documents_index after insert or update or delete on public.documents
  for each row execute function public.tg_index_entity('title', 'file_name', 'description');

alter table public.documents enable row level security;
create policy documents_select on public.documents for select to authenticated
  using (public.is_workspace_member(workspace_id));
create policy documents_insert on public.documents for insert to authenticated
  with check (public.can_write_workspace(workspace_id) and created_by = auth.uid());
create policy documents_update on public.documents for update to authenticated
  using (public.can_edit_row(workspace_id, created_by)) with check (public.can_edit_row(workspace_id, created_by));
create policy documents_delete on public.documents for delete to authenticated
  using (public.can_edit_row(workspace_id, created_by));

-- ---------------------------------------------------------------------
-- Tabelas de apoio com workspace herdado do registro pai
-- ---------------------------------------------------------------------

-- Gera políticas padrão de conteúdo para uma tabela.
create or replace function public.apply_content_policies(p_table text)
returns void
language plpgsql
as $$
begin
  execute format('alter table public.%I enable row level security', p_table);
  execute format('create policy %I on public.%I for select to authenticated using (public.is_workspace_member(workspace_id))', p_table || '_select', p_table);
  execute format('create policy %I on public.%I for insert to authenticated with check (public.can_write_workspace(workspace_id) and created_by = auth.uid())', p_table || '_insert', p_table);
  execute format('create policy %I on public.%I for update to authenticated using (public.can_edit_row(workspace_id, created_by)) with check (public.can_edit_row(workspace_id, created_by))', p_table || '_update', p_table);
  execute format('create policy %I on public.%I for delete to authenticated using (public.can_edit_row(workspace_id, created_by))', p_table || '_delete', p_table);
end;
$$;

-- Itens de coleção de artigos
create table public.article_collection_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  collection_id uuid not null references public.article_collections (id) on delete cascade,
  article_id uuid not null references public.articles (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (collection_id, article_id)
);
create index article_collection_items_article_idx on public.article_collection_items (article_id);

create or replace function public.tg_article_collection_items_refs()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_same_workspace('article_collections', new.collection_id, new.workspace_id);
  perform public.assert_same_workspace('articles', new.article_id, new.workspace_id);
  return new;
end;
$$;
create trigger article_collection_items_refs before insert or update on public.article_collection_items
  for each row execute function public.tg_article_collection_items_refs();
create trigger article_collection_items_protect before update on public.article_collection_items
  for each row execute function public.protect_ownership();
do $$ begin perform public.apply_content_policies('article_collection_items'); end $$;

-- Etapas personalizadas de projetos
create table public.project_stages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  project_id uuid not null references public.projects (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  position integer not null default 0,
  is_done boolean not null default false,
  due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index project_stages_project_idx on public.project_stages (project_id, position);

create or replace function public.tg_project_stages_refs()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_same_workspace('projects', new.project_id, new.workspace_id);
  return new;
end;
$$;
create trigger project_stages_refs before insert or update on public.project_stages
  for each row execute function public.tg_project_stages_refs();
create trigger project_stages_protect before update on public.project_stages
  for each row execute function public.protect_ownership();
do $$ begin perform public.apply_content_policies('project_stages'); end $$;

-- Histórico de revisões de flashcards
create table public.flashcard_reviews (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  flashcard_id uuid not null references public.flashcards (id) on delete cascade,
  rating text not null check (rating in ('errei', 'dificil', 'bom', 'facil')),
  was_correct boolean not null,
  interval_before integer not null default 0,
  interval_after integer not null default 0,
  ease_after numeric(4,2) not null,
  reviewed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index flashcard_reviews_card_idx on public.flashcard_reviews (flashcard_id, reviewed_at desc);
create index flashcard_reviews_ws_idx on public.flashcard_reviews (workspace_id, reviewed_at desc);

create or replace function public.tg_flashcard_reviews_refs()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_same_workspace('flashcards', new.flashcard_id, new.workspace_id);
  return new;
end;
$$;
create trigger flashcard_reviews_refs before insert on public.flashcard_reviews
  for each row execute function public.tg_flashcard_reviews_refs();
do $$ begin perform public.apply_content_policies('flashcard_reviews'); end $$;

-- Simulados
create table public.quizzes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  subject_id uuid references public.subjects (id) on delete set null,
  topic text check (char_length(topic) <= 200),
  time_limit_minutes integer check (time_limit_minutes is null or time_limit_minutes between 1 and 600),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index quizzes_ws_idx on public.quizzes (workspace_id, created_at desc);

create or replace function public.tg_quizzes_refs()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_same_workspace('subjects', new.subject_id, new.workspace_id);
  return new;
end;
$$;
create trigger quizzes_refs before insert or update on public.quizzes
  for each row execute function public.tg_quizzes_refs();
create trigger quizzes_protect before update on public.quizzes
  for each row execute function public.protect_ownership();
do $$ begin perform public.apply_content_policies('quizzes'); end $$;

create table public.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  quiz_id uuid not null references public.quizzes (id) on delete cascade,
  question_id uuid not null references public.questions (id) on delete cascade,
  position integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (quiz_id, question_id)
);
create index quiz_questions_quiz_idx on public.quiz_questions (quiz_id, position);

create or replace function public.tg_quiz_questions_refs()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_same_workspace('quizzes', new.quiz_id, new.workspace_id);
  perform public.assert_same_workspace('questions', new.question_id, new.workspace_id);
  return new;
end;
$$;
create trigger quiz_questions_refs before insert or update on public.quiz_questions
  for each row execute function public.tg_quiz_questions_refs();
do $$ begin perform public.apply_content_policies('quiz_questions'); end $$;

create table public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  quiz_id uuid not null references public.quizzes (id) on delete cascade,
  started_at timestamptz not null,
  finished_at timestamptz not null default now(),
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  -- [{question_id, selected_option, text_answer, correct, self_assessed}]
  answers jsonb not null default '[]'::jsonb check (jsonb_typeof(answers) = 'array'),
  objective_total integer not null default 0,
  objective_correct integer not null default 0,
  discursive_total integer not null default 0,
  score_percent numeric(5,2) check (score_percent is null or score_percent between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index quiz_attempts_ws_idx on public.quiz_attempts (workspace_id, finished_at desc);
create index quiz_attempts_quiz_idx on public.quiz_attempts (quiz_id);

create or replace function public.tg_quiz_attempts_refs()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_same_workspace('quizzes', new.quiz_id, new.workspace_id);
  return new;
end;
$$;
create trigger quiz_attempts_refs before insert on public.quiz_attempts
  for each row execute function public.tg_quiz_attempts_refs();
do $$ begin perform public.apply_content_policies('quiz_attempts'); end $$;

-- Perfil da liga (um por workspace)
create table public.league_profiles (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null unique references public.workspaces (id) on delete cascade,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  name text not null check (char_length(btrim(name)) between 1 and 200),
  acronym text check (char_length(acronym) <= 30),
  institution text check (char_length(institution) <= 200),
  foundation_date date,
  advisor text check (char_length(advisor) <= 200),
  description text check (char_length(description) <= 10000),
  objectives text check (char_length(objectives) <= 10000),
  focus_areas text check (char_length(focus_areas) <= 2000),
  contact_email text check (contact_email is null or contact_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger league_profiles_protect before update on public.league_profiles
  for each row execute function public.protect_ownership();
do $$ begin perform public.apply_content_policies('league_profiles'); end $$;

-- Somente admins editam o perfil da liga.
drop policy league_profiles_update on public.league_profiles;
create policy league_profiles_update on public.league_profiles for update to authenticated
  using (public.is_workspace_admin(workspace_id) or public.can_edit_row(workspace_id, created_by))
  with check (public.is_workspace_admin(workspace_id) or public.can_edit_row(workspace_id, created_by));

drop function public.apply_content_policies(text);

-- ---------------------------------------------------------------------
-- Notificações automáticas
-- ---------------------------------------------------------------------

create or replace function public.pref_enabled(p_prefs jsonb, p_key text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce((p_prefs ->> p_key)::boolean, true);
$$;

-- Gera notificações pendentes para o usuário autenticado. Idempotente (dedupe_key).
create or replace function public.generate_my_notifications()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_prefs jsonb;
  v_total integer := 0;
  v_n integer;
  v_tz text := 'America/Sao_Paulo';
begin
  if v_uid is null then
    return 0;
  end if;
  select notification_prefs into v_prefs from public.user_preferences where user_id = v_uid;
  v_prefs := coalesce(v_prefs, '{}'::jsonb);

  if public.pref_enabled(v_prefs, 'prazos') then
    insert into public.notifications (user_id, workspace_id, type, title, body, link, dedupe_key)
    select v_uid, t.workspace_id, 'prazo', 'Prazo próximo: ' || left(t.title, 120),
           'Vence em ' || to_char(t.due_at at time zone v_tz, 'DD/MM/YYYY "às" HH24:MI') || '.',
           '/tarefas/' || t.id, 'task_due:' || t.id || ':' || (t.due_at at time zone v_tz)::date
      from public.tasks t
     where t.workspace_id in (select public.my_workspace_ids())
       and t.created_by = v_uid
       and t.status in ('pendente', 'em_andamento')
       and t.due_at between now() and now() + interval '48 hours'
    on conflict (user_id, dedupe_key) do nothing;
    get diagnostics v_n = row_count; v_total := v_total + v_n;

    insert into public.notifications (user_id, workspace_id, type, title, body, link, dedupe_key)
    select v_uid, p.workspace_id, 'prazo', 'Projeto com prazo próximo: ' || left(p.name, 120),
           'Prazo em ' || to_char(p.due_date, 'DD/MM/YYYY') || '.',
           '/projetos/' || p.id, 'project_due:' || p.id || ':' || p.due_date
      from public.projects p
     where p.workspace_id in (select public.my_workspace_ids())
       and p.status <> 'concluido'
       and p.due_date between current_date and current_date + 3
    on conflict (user_id, dedupe_key) do nothing;
    get diagnostics v_n = row_count; v_total := v_total + v_n;
  end if;

  if public.pref_enabled(v_prefs, 'tarefas_atrasadas') then
    insert into public.notifications (user_id, workspace_id, type, title, body, link, dedupe_key)
    select v_uid, t.workspace_id, 'tarefa_atrasada', 'Tarefa atrasada: ' || left(t.title, 120),
           'O prazo era ' || to_char(t.due_at at time zone v_tz, 'DD/MM/YYYY "às" HH24:MI') || '.',
           '/tarefas/' || t.id, 'task_overdue:' || t.id || ':' || (t.due_at at time zone v_tz)::date
      from public.tasks t
     where t.workspace_id in (select public.my_workspace_ids())
       and t.created_by = v_uid
       and t.status in ('pendente', 'em_andamento')
       and t.due_at < now()
    on conflict (user_id, dedupe_key) do nothing;
    get diagnostics v_n = row_count; v_total := v_total + v_n;
  end if;

  if public.pref_enabled(v_prefs, 'provas') then
    insert into public.notifications (user_id, workspace_id, type, title, body, link, dedupe_key)
    select v_uid, a.workspace_id, 'prova', 'Avaliação em breve: ' || left(a.title, 120),
           'Agendada para ' || to_char(a.assessment_date at time zone v_tz, 'DD/MM/YYYY "às" HH24:MI') || '.',
           '/provas/' || a.id, 'exam:' || a.id || ':' || (a.assessment_date at time zone v_tz)::date
      from public.assessments a
     where a.workspace_id in (select public.my_workspace_ids())
       and a.status = 'agendada'
       and a.assessment_date between now() and now() + interval '7 days'
    on conflict (user_id, dedupe_key) do nothing;
    get diagnostics v_n = row_count; v_total := v_total + v_n;

    insert into public.notifications (user_id, workspace_id, type, title, body, link, dedupe_key)
    select v_uid, e.workspace_id, 'prova', 'Prova na agenda: ' || left(e.title, 120),
           'Em ' || to_char(e.start_at at time zone v_tz, 'DD/MM/YYYY "às" HH24:MI') || '.',
           '/eventos/' || e.id, 'event_exam:' || e.id || ':' || (e.start_at at time zone v_tz)::date
      from public.events e
     where e.workspace_id in (select public.my_workspace_ids())
       and e.category = 'prova'
       and e.start_at between now() and now() + interval '7 days'
    on conflict (user_id, dedupe_key) do nothing;
    get diagnostics v_n = row_count; v_total := v_total + v_n;
  end if;

  if public.pref_enabled(v_prefs, 'revisoes') then
    insert into public.notifications (user_id, workspace_id, type, title, body, link, dedupe_key)
    select v_uid, f.workspace_id, 'revisao', 'Flashcards para revisar',
           count(*) || ' cartão(ões) aguardando revisão.', '/flashcards/revisar',
           'srs:' || f.workspace_id || ':' || (now() at time zone v_tz)::date
      from public.flashcards f
     where f.workspace_id in (select public.my_workspace_ids())
       and f.created_by = v_uid
       and f.next_review_at <= now()
     group by f.workspace_id
    on conflict (user_id, dedupe_key) do nothing;
    get diagnostics v_n = row_count; v_total := v_total + v_n;
  end if;

  if public.pref_enabled(v_prefs, 'metas') then
    insert into public.notifications (user_id, workspace_id, type, title, body, link, dedupe_key)
    select v_uid, g.workspace_id, 'meta', 'Meta com prazo próximo: ' || left(g.title, 120),
           'Prazo em ' || to_char(g.target_date, 'DD/MM/YYYY') || ' — progresso ' || g.progress || '%.',
           '/metas-academicas/' || g.id, 'study_goal:' || g.id || ':' || g.target_date
      from public.study_goals g
     where g.workspace_id in (select public.my_workspace_ids())
       and g.created_by = v_uid and g.status = 'ativa'
       and g.target_date between current_date and current_date + 7
    on conflict (user_id, dedupe_key) do nothing;
    get diagnostics v_n = row_count; v_total := v_total + v_n;

    insert into public.notifications (user_id, workspace_id, type, title, body, link, dedupe_key)
    select v_uid, g.workspace_id, 'meta', 'Meta profissional com prazo próximo: ' || left(g.title, 120),
           'Prazo em ' || to_char(g.deadline, 'DD/MM/YYYY') || ' — progresso ' || g.progress || '%.',
           '/metas-profissionais/' || g.id, 'pro_goal:' || g.id || ':' || g.deadline
      from public.professional_goals g
     where g.workspace_id in (select public.my_workspace_ids())
       and g.created_by = v_uid and g.status = 'ativa'
       and g.deadline between current_date and current_date + 7
    on conflict (user_id, dedupe_key) do nothing;
    get diagnostics v_n = row_count; v_total := v_total + v_n;
  end if;

  if public.pref_enabled(v_prefs, 'liga') then
    insert into public.notifications (user_id, workspace_id, type, title, body, link, dedupe_key)
    select v_uid, a.workspace_id, 'liga', 'Atividade da liga: ' || left(a.title, 120),
           'Em ' || to_char(a.starts_at at time zone v_tz, 'DD/MM/YYYY "às" HH24:MI') || '.',
           '/liga-atividades/' || a.id, 'league:' || a.id || ':' || (a.starts_at at time zone v_tz)::date
      from public.league_activities a
     where a.workspace_id in (select public.my_workspace_ids())
       and a.status = 'planejada'
       and a.starts_at between now() and now() + interval '3 days'
    on conflict (user_id, dedupe_key) do nothing;
    get diagnostics v_n = row_count; v_total := v_total + v_n;
  end if;

  return v_total;
end;
$$;

-- Atualizações de projetos em workspaces compartilhados notificam os demais membros.
create or replace function public.tg_projects_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status or new.due_date is distinct from old.due_date then
    insert into public.notifications (user_id, workspace_id, type, title, body, link, dedupe_key)
    select m.user_id, new.workspace_id, 'projeto', 'Projeto atualizado: ' || left(new.name, 120),
           case when new.status is distinct from old.status
                then 'Status alterado para "' || replace(new.status, '_', ' ') || '".'
                else 'Prazo alterado.' end,
           '/projetos/' || new.id,
           'project_update:' || new.id || ':' || new.status || ':' || coalesce(new.due_date::text, '') || ':' || floor(extract(epoch from now()) / 600)
      from public.workspace_members m
      left join public.user_preferences p on p.user_id = m.user_id
     where m.workspace_id = new.workspace_id
       and m.user_id is distinct from auth.uid()
       and public.pref_enabled(coalesce(p.notification_prefs, '{}'::jsonb), 'projetos')
    on conflict (user_id, dedupe_key) do nothing;
  end if;
  return new;
end;
$$;
create trigger projects_notify after update on public.projects
  for each row execute function public.tg_projects_notify();

-- ---------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents', 'documents', false, 52428800,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/png',
    'image/jpeg'
  ]
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 2097152, array['image/png', 'image/jpeg'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Caminho: {workspace_id}/{document_id}/{arquivo}
create policy documents_objects_select on storage.objects for select to authenticated
  using (
    bucket_id = 'documents'
    and public.is_workspace_member(public.try_uuid((storage.foldername(name))[1]))
  );

create policy documents_objects_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'documents'
    and public.can_write_workspace(public.try_uuid((storage.foldername(name))[1]))
    and exists (
      select 1 from public.documents d
       where d.storage_path = name
         and d.created_by = auth.uid()
         and d.upload_status = 'pendente'
    )
  );

create policy documents_objects_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'documents'
    and exists (
      select 1 from public.documents d
       where d.storage_path = name
         and public.can_edit_row(d.workspace_id, d.created_by)
    )
  );

-- Avatares: {user_id}/avatar.(png|jpg)
create policy avatars_select on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatars_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatars_update on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatars_delete on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- >>> supabase/migrations/20260101000004_ai.sql
-- =====================================================================
-- Migration 0004: Assistente Acadêmico (conversas, mensagens, uso),
-- trechos de documentos e fila de processamento. A coluna vetorial e a
-- busca híbrida ficam na migration 0005 (pgvector).
-- =====================================================================

create table public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null default 'Nova conversa' check (char_length(title) between 1 and 200),
  topic text check (char_length(topic) <= 100),
  context_type text check (char_length(context_type) <= 64),
  context_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_conversations_context check ((context_type is null) = (context_id is null))
);
create index ai_conversations_user_idx on public.ai_conversations (created_by, workspace_id, updated_at desc);
create trigger ai_conversations_updated_at before update on public.ai_conversations
  for each row execute function public.protect_ownership();

create table public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) <= 100000),
  -- [{n, type, id, title, page, document_id, excerpt, href}]
  citations jsonb not null default '[]'::jsonb check (jsonb_typeof(citations) = 'array'),
  provider text,
  model text,
  tokens_in integer,
  tokens_out integer,
  created_at timestamptz not null default now()
);
create index ai_messages_conv_idx on public.ai_messages (conversation_id, created_at);
create index ai_messages_fts_idx on public.ai_messages using gin (to_tsvector('simple', public.normalize_search(content)));

create or replace function public.tg_ai_messages_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.ai_conversations c
     where c.id = new.conversation_id and c.workspace_id = new.workspace_id and c.created_by = new.created_by
  ) then
    raise exception 'Conversa inválida';
  end if;
  update public.ai_conversations set updated_at = now() where id = new.conversation_id;
  return new;
end;
$$;
create trigger ai_messages_check before insert on public.ai_messages
  for each row execute function public.tg_ai_messages_check();

create table public.ai_usage_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete set null,
  provider text not null,
  model text not null,
  operation text not null check (operation in ('chat', 'embedding', 'generation')),
  status text not null check (status in ('ok', 'erro', 'cancelado', 'limite')),
  tokens_in integer not null default 0,
  tokens_out integer not null default 0,
  estimated_cost_usd numeric(12,6) not null default 0,
  latency_ms integer,
  error text check (char_length(error) <= 2000),
  created_at timestamptz not null default now()
);
create index ai_usage_logs_user_idx on public.ai_usage_logs (user_id, created_at desc);

create table public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  chunk_index integer not null check (chunk_index >= 0),
  page_number integer check (page_number is null or page_number >= 1),
  content text not null check (char_length(content) between 1 and 12000),
  token_estimate integer,
  embedding_model text,
  fts tsvector generated always as (to_tsvector('simple', public.normalize_search(content))) stored,
  created_at timestamptz not null default now(),
  unique (document_id, chunk_index)
);
create index document_chunks_doc_idx on public.document_chunks (document_id);
create index document_chunks_ws_idx on public.document_chunks (workspace_id);
create index document_chunks_fts_idx on public.document_chunks using gin (fts);

create or replace function public.tg_document_chunks_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.documents d where d.id = new.document_id and d.workspace_id = new.workspace_id) then
    raise exception 'Documento inválido para o workspace';
  end if;
  return new;
end;
$$;
create trigger document_chunks_check before insert on public.document_chunks
  for each row execute function public.tg_document_chunks_check();

create table public.document_processing_jobs (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  status text not null default 'aguardando' check (status in ('aguardando', 'processando', 'concluido', 'falha')),
  attempt integer not null default 1,
  error text check (char_length(error) <= 2000),
  stats jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);
create index document_processing_jobs_doc_idx on public.document_processing_jobs (document_id, created_at desc);

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------

alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;
alter table public.ai_usage_logs enable row level security;
alter table public.document_chunks enable row level security;
alter table public.document_processing_jobs enable row level security;

-- Conversas são privadas do autor, mesmo em workspaces compartilhados.
create policy ai_conversations_select on public.ai_conversations for select to authenticated
  using (created_by = auth.uid() and public.is_workspace_member(workspace_id));
create policy ai_conversations_insert on public.ai_conversations for insert to authenticated
  with check (created_by = auth.uid() and public.is_workspace_member(workspace_id));
create policy ai_conversations_update on public.ai_conversations for update to authenticated
  using (created_by = auth.uid()) with check (created_by = auth.uid());
create policy ai_conversations_delete on public.ai_conversations for delete to authenticated
  using (created_by = auth.uid());

create policy ai_messages_select on public.ai_messages for select to authenticated
  using (created_by = auth.uid() and public.is_workspace_member(workspace_id));
create policy ai_messages_insert on public.ai_messages for insert to authenticated
  with check (created_by = auth.uid() and public.is_workspace_member(workspace_id));
create policy ai_messages_delete on public.ai_messages for delete to authenticated
  using (created_by = auth.uid());

create policy ai_usage_logs_select on public.ai_usage_logs for select to authenticated using (user_id = auth.uid());
create policy ai_usage_logs_insert on public.ai_usage_logs for insert to authenticated with check (user_id = auth.uid());

create policy document_chunks_select on public.document_chunks for select to authenticated
  using (public.is_workspace_member(workspace_id));
create policy document_chunks_insert on public.document_chunks for insert to authenticated
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from public.documents d
       where d.id = document_id and public.can_edit_row(d.workspace_id, d.created_by)
    )
  );
create policy document_chunks_update on public.document_chunks for update to authenticated
  using (exists (select 1 from public.documents d where d.id = document_id and public.can_edit_row(d.workspace_id, d.created_by)))
  with check (exists (select 1 from public.documents d where d.id = document_id and public.can_edit_row(d.workspace_id, d.created_by)));
create policy document_chunks_delete on public.document_chunks for delete to authenticated
  using (exists (select 1 from public.documents d where d.id = document_id and public.can_edit_row(d.workspace_id, d.created_by)));

create policy document_processing_jobs_select on public.document_processing_jobs for select to authenticated
  using (public.is_workspace_member(workspace_id));
create policy document_processing_jobs_insert on public.document_processing_jobs for insert to authenticated
  with check (
    created_by = auth.uid()
    and exists (select 1 from public.documents d where d.id = document_id and d.workspace_id = workspace_id
                and public.can_edit_row(d.workspace_id, d.created_by))
  );
create policy document_processing_jobs_update on public.document_processing_jobs for update to authenticated
  using (created_by = auth.uid()) with check (created_by = auth.uid());

-- ---------------------------------------------------------------------
-- Busca textual em trechos (autorização aplicada antes da recuperação)
-- ---------------------------------------------------------------------

create or replace function public.search_document_chunks_text(
  p_query text,
  p_workspace_id uuid default null,
  p_document_ids uuid[] default null,
  p_limit integer default 8
)
returns table (
  chunk_id uuid,
  document_id uuid,
  workspace_id uuid,
  document_title text,
  file_name text,
  page_number integer,
  chunk_index integer,
  content text,
  score real
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_or_query tsquery;
begin
  -- Termos combinados com OR para maior revocação; ranking ordena por relevância.
  select to_tsquery('simple', string_agg(t || ':*', ' | '))
    into v_or_query
    from (
      select regexp_replace(w, '[^[:alnum:]]', '', 'g') as t
        from regexp_split_to_table(public.normalize_search(p_query), '\s+') as w
    ) s
   where length(t) > 2;

  if v_or_query is null then
    return;
  end if;

  return query
    select c.id, c.document_id, c.workspace_id, d.title, d.file_name, c.page_number, c.chunk_index, c.content,
           ts_rank_cd(c.fts, v_or_query)::real as score
      from public.document_chunks c
      join public.documents d on d.id = c.document_id
     where c.workspace_id in (select public.my_workspace_ids())
       and (p_workspace_id is null or c.workspace_id = p_workspace_id)
       and (p_document_ids is null or c.document_id = any (p_document_ids))
       and d.processing_status = 'concluido'
       and c.fts @@ v_or_query
     order by score desc
     limit least(greatest(coalesce(p_limit, 8), 1), 50);
end;
$$;

-- >>> supabase/migrations/20260101000005_pgvector.sql
-- =====================================================================
-- Migration 0005: busca semântica com pgvector + busca híbrida.
-- Dimensão padrão 1536 (OpenAI text-embedding-3-small). Se mudar o modelo
-- de embeddings para outra dimensão, crie uma nova migration ajustando a
-- coluna e reprocesse os documentos.
-- =====================================================================

create extension if not exists vector with schema extensions;

alter table public.document_chunks add column embedding extensions.vector(1536);

create index document_chunks_embedding_idx on public.document_chunks
  using hnsw (embedding extensions.vector_cosine_ops);

-- Busca híbrida (Reciprocal Rank Fusion entre similaridade vetorial e texto).
-- SECURITY INVOKER: RLS + filtro explícito por workspaces do usuário são
-- aplicados ANTES de qualquer ranqueamento.
create or replace function public.match_document_chunks(
  p_query_embedding extensions.vector(1536),
  p_query text,
  p_workspace_id uuid default null,
  p_document_ids uuid[] default null,
  p_limit integer default 8
)
returns table (
  chunk_id uuid,
  document_id uuid,
  workspace_id uuid,
  document_title text,
  file_name text,
  page_number integer,
  chunk_index integer,
  content text,
  score real
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_k constant integer := 60;
  v_or_query tsquery;
  v_limit integer := least(greatest(coalesce(p_limit, 8), 1), 50);
begin
  select to_tsquery('simple', string_agg(t || ':*', ' | '))
    into v_or_query
    from (
      select regexp_replace(w, '[^[:alnum:]]', '', 'g') as t
        from regexp_split_to_table(public.normalize_search(coalesce(p_query, '')), '\s+') as w
    ) s
   where length(t) > 2;

  return query
  with allowed as (
    select c.id, c.document_id, c.workspace_id, c.page_number, c.chunk_index, c.content, c.embedding, c.fts,
           d.title, d.file_name
      from public.document_chunks c
      join public.documents d on d.id = c.document_id
     where c.workspace_id in (select public.my_workspace_ids())
       and (p_workspace_id is null or c.workspace_id = p_workspace_id)
       and (p_document_ids is null or c.document_id = any (p_document_ids))
       and d.processing_status = 'concluido'
  ),
  semantic as (
    select a.id, row_number() over (order by a.embedding operator(extensions.<=>) p_query_embedding) as r
      from allowed a
     where a.embedding is not null and p_query_embedding is not null
     order by a.embedding operator(extensions.<=>) p_query_embedding
     limit v_limit * 4
  ),
  lexical as (
    select a.id, row_number() over (order by ts_rank_cd(a.fts, v_or_query) desc) as r
      from allowed a
     where v_or_query is not null and a.fts @@ v_or_query
     order by ts_rank_cd(a.fts, v_or_query) desc
     limit v_limit * 4
  ),
  fused as (
    select coalesce(s.id, l.id) as id,
           (coalesce(1.0 / (v_k + s.r), 0) + coalesce(1.0 / (v_k + l.r), 0))::real as score
      from semantic s
      full outer join lexical l on l.id = s.id
  )
  select a.id, a.document_id, a.workspace_id, a.title, a.file_name, a.page_number, a.chunk_index, a.content, f.score
    from fused f
    join allowed a on a.id = f.id
   order by f.score desc
   limit v_limit;
end;
$$;

-- >>> supabase/migrations/20260101000006_scope_simplification.sql
-- =====================================================================
-- Migration 0006: simplificação do escopo.
-- Remove módulos descontinuados: metas acadêmicas, glossário técnico,
-- biblioteca de condutas, membros/perfil da liga, certificados e todo o
-- desenvolvimento profissional (estágios, registros de estágio, horas
-- complementares, portfólio e metas profissionais). A tabela
-- league_activities passa a registrar apenas projetos e atividades.
-- Idempotente: pode ser aplicada em bancos novos ou já existentes.
-- =====================================================================

-- Relacionamentos e índice de busca dos tipos removidos
delete from public.entity_links
 where source_type in ('study_goals','glossary_terms','clinical_conducts','league_members','internships','internship_logs','certificates','complementary_activities','portfolio_items','professional_goals')
    or target_type in ('study_goals','glossary_terms','clinical_conducts','league_members','internships','internship_logs','certificates','complementary_activities','portfolio_items','professional_goals');
delete from public.search_index
 where entity_type in ('study_goals','glossary_terms','clinical_conducts','league_members','internships','internship_logs','certificates','complementary_activities','portfolio_items','professional_goals');

drop table if exists public.complementary_activities cascade;
drop table if exists public.certificates cascade;
drop table if exists public.internship_logs cascade;
drop table if exists public.internships cascade;
drop table if exists public.portfolio_items cascade;
drop table if exists public.professional_goals cascade;
drop table if exists public.study_goals cascade;
drop table if exists public.glossary_terms cascade;
drop table if exists public.clinical_conducts cascade;
drop table if exists public.league_members cascade;
drop table if exists public.league_profiles cascade;

drop function if exists public.tg_complementary_activities_refs();
drop function if exists public.tg_internship_logs_refs();
drop function if exists public.tg_study_goals_refs();

-- league_activities: somente projetos e atividades
update public.league_activities set activity_type = 'outro'
 where activity_type not in ('projeto_cientifico', 'projeto_extensao', 'outro');
alter table public.league_activities drop constraint if exists league_activities_activity_type_chk2;
alter table public.league_activities add constraint league_activities_activity_type_chk2
  check (activity_type is null or activity_type in ('projeto_cientifico', 'projeto_extensao', 'outro'));
alter table public.league_activities alter column activity_type set default 'projeto_cientifico';

-- Notificações sem os módulos de metas
create or replace function public.generate_my_notifications()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_prefs jsonb;
  v_total integer := 0;
  v_n integer;
  v_tz text := 'America/Sao_Paulo';
begin
  if v_uid is null then
    return 0;
  end if;
  select notification_prefs into v_prefs from public.user_preferences where user_id = v_uid;
  v_prefs := coalesce(v_prefs, '{}'::jsonb);

  if public.pref_enabled(v_prefs, 'prazos') then
    insert into public.notifications (user_id, workspace_id, type, title, body, link, dedupe_key)
    select v_uid, t.workspace_id, 'prazo', 'Prazo próximo: ' || left(t.title, 120),
           'Vence em ' || to_char(t.due_at at time zone v_tz, 'DD/MM/YYYY "às" HH24:MI') || '.',
           '/tarefas/' || t.id, 'task_due:' || t.id || ':' || (t.due_at at time zone v_tz)::date
      from public.tasks t
     where t.workspace_id in (select public.my_workspace_ids())
       and t.created_by = v_uid
       and t.status in ('pendente', 'em_andamento')
       and t.due_at between now() and now() + interval '48 hours'
    on conflict (user_id, dedupe_key) do nothing;
    get diagnostics v_n = row_count; v_total := v_total + v_n;

    insert into public.notifications (user_id, workspace_id, type, title, body, link, dedupe_key)
    select v_uid, p.workspace_id, 'prazo', 'Projeto com prazo próximo: ' || left(p.name, 120),
           'Prazo em ' || to_char(p.due_date, 'DD/MM/YYYY') || '.',
           '/projetos/' || p.id, 'project_due:' || p.id || ':' || p.due_date
      from public.projects p
     where p.workspace_id in (select public.my_workspace_ids())
       and p.status <> 'concluido'
       and p.due_date between current_date and current_date + 3
    on conflict (user_id, dedupe_key) do nothing;
    get diagnostics v_n = row_count; v_total := v_total + v_n;
  end if;

  if public.pref_enabled(v_prefs, 'tarefas_atrasadas') then
    insert into public.notifications (user_id, workspace_id, type, title, body, link, dedupe_key)
    select v_uid, t.workspace_id, 'tarefa_atrasada', 'Tarefa atrasada: ' || left(t.title, 120),
           'O prazo era ' || to_char(t.due_at at time zone v_tz, 'DD/MM/YYYY "às" HH24:MI') || '.',
           '/tarefas/' || t.id, 'task_overdue:' || t.id || ':' || (t.due_at at time zone v_tz)::date
      from public.tasks t
     where t.workspace_id in (select public.my_workspace_ids())
       and t.created_by = v_uid
       and t.status in ('pendente', 'em_andamento')
       and t.due_at < now()
    on conflict (user_id, dedupe_key) do nothing;
    get diagnostics v_n = row_count; v_total := v_total + v_n;
  end if;

  if public.pref_enabled(v_prefs, 'provas') then
    insert into public.notifications (user_id, workspace_id, type, title, body, link, dedupe_key)
    select v_uid, a.workspace_id, 'prova', 'Avaliação em breve: ' || left(a.title, 120),
           'Agendada para ' || to_char(a.assessment_date at time zone v_tz, 'DD/MM/YYYY "às" HH24:MI') || '.',
           '/provas/' || a.id, 'exam:' || a.id || ':' || (a.assessment_date at time zone v_tz)::date
      from public.assessments a
     where a.workspace_id in (select public.my_workspace_ids())
       and a.status = 'agendada'
       and a.assessment_date between now() and now() + interval '7 days'
    on conflict (user_id, dedupe_key) do nothing;
    get diagnostics v_n = row_count; v_total := v_total + v_n;

    insert into public.notifications (user_id, workspace_id, type, title, body, link, dedupe_key)
    select v_uid, e.workspace_id, 'prova', 'Prova na agenda: ' || left(e.title, 120),
           'Em ' || to_char(e.start_at at time zone v_tz, 'DD/MM/YYYY "às" HH24:MI') || '.',
           '/eventos/' || e.id, 'event_exam:' || e.id || ':' || (e.start_at at time zone v_tz)::date
      from public.events e
     where e.workspace_id in (select public.my_workspace_ids())
       and e.category = 'prova'
       and e.start_at between now() and now() + interval '7 days'
    on conflict (user_id, dedupe_key) do nothing;
    get diagnostics v_n = row_count; v_total := v_total + v_n;
  end if;

  if public.pref_enabled(v_prefs, 'revisoes') then
    insert into public.notifications (user_id, workspace_id, type, title, body, link, dedupe_key)
    select v_uid, f.workspace_id, 'revisao', 'Flashcards para revisar',
           count(*) || ' cartão(ões) aguardando revisão.', '/flashcards/revisar',
           'srs:' || f.workspace_id || ':' || (now() at time zone v_tz)::date
      from public.flashcards f
     where f.workspace_id in (select public.my_workspace_ids())
       and f.created_by = v_uid
       and f.next_review_at <= now()
     group by f.workspace_id
    on conflict (user_id, dedupe_key) do nothing;
    get diagnostics v_n = row_count; v_total := v_total + v_n;
  end if;

  if public.pref_enabled(v_prefs, 'liga') then
    insert into public.notifications (user_id, workspace_id, type, title, body, link, dedupe_key)
    select v_uid, a.workspace_id, 'liga', 'Atividade da liga: ' || left(a.title, 120),
           'Em ' || to_char(a.starts_at at time zone v_tz, 'DD/MM/YYYY "às" HH24:MI') || '.',
           '/liga-atividades/' || a.id, 'league:' || a.id || ':' || (a.starts_at at time zone v_tz)::date
      from public.league_activities a
     where a.workspace_id in (select public.my_workspace_ids())
       and a.status = 'planejada'
       and a.starts_at between now() and now() + interval '3 days'
    on conflict (user_id, dedupe_key) do nothing;
    get diagnostics v_n = row_count; v_total := v_total + v_n;
  end if;

  return v_total;
end;
$$;
