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
