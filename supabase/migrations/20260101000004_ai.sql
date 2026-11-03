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
