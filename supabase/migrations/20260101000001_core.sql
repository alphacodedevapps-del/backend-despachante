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
