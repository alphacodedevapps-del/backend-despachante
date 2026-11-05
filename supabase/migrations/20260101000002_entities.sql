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

