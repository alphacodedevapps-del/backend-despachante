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
