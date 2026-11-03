-- =====================================================================
-- Testes de isolamento, papéis, convites, busca e integridade.
-- Executado por scripts/test-db.sh após aplicar as migrations.
-- Cada asserção lança exceção em caso de falha (ON_ERROR_STOP).
-- =====================================================================

\set ON_ERROR_STOP 1
\set a '''aaaaaaaa-0000-0000-0000-000000000001'''
\set b '''bbbbbbbb-0000-0000-0000-000000000002'''
\set c '''cccccccc-0000-0000-0000-000000000003'''

-- Helpers de teste ----------------------------------------------------
create or replace function pg_temp.login(p uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p::text, false);
  execute 'set role authenticated';
end $$;

create or replace function pg_temp.expect_error(p_sql text, p_label text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    raise notice 'OK (erro esperado): % — %', p_label, sqlerrm;
    return;
  end;
  raise exception 'FALHA: esperado erro em "%"', p_label;
end $$;

create or replace function pg_temp.expect_eq(p_actual bigint, p_expected bigint, p_label text) returns void language plpgsql as $$
begin
  if p_actual is distinct from p_expected then
    raise exception 'FALHA: % — esperado %, obtido %', p_label, p_expected, p_actual;
  end if;
  raise notice 'OK: %', p_label;
end $$;

-- Usuários ------------------------------------------------------------
reset role;
insert into auth.users (id, email, raw_user_meta_data) values
  (:a, 'ana@example.com', '{"full_name":"Ana"}'),
  (:b, 'bruno@example.com', '{"full_name":"Bruno"}'),
  (:c, 'carla@example.com', '{"full_name":"Carla"}');

select pg_temp.expect_eq((select count(*) from public.workspaces where is_personal), 3, 'cada usuário recebe um workspace pessoal');
select pg_temp.expect_eq((select count(*) from public.workspace_members where role = 'owner'), 3, 'owner registrado como membro');
select pg_temp.expect_eq((select count(*) from public.user_preferences), 3, 'preferências criadas');

-- Isolamento entre usuários --------------------------------------------
select pg_temp.login(:a);
create temp table ctx as select
  (select id from public.workspaces where owner_id = :a and is_personal) as ws_a,
  (select id from public.workspaces where owner_id = :b and is_personal) as ws_b_guess;
grant select on ctx to authenticated;

insert into public.subjects (workspace_id, name, syllabus)
  select ws_a, 'Cinesiologia', 'Estudo do movimento humano e manguito rotador' from ctx;
select pg_temp.expect_eq((select count(*) from public.subjects), 1, 'A vê a própria disciplina');
select pg_temp.expect_eq((select count(*) from public.global_search('manguito')), 1, 'busca global encontra conteúdo de A');
select pg_temp.expect_eq((select count(*) from public.global_search('cinesio')), 1, 'busca por prefixo funciona');

select pg_temp.login(:b);
select pg_temp.expect_eq((select count(*) from public.workspaces), 1, 'B vê somente o próprio workspace');
select pg_temp.expect_eq((select count(*) from public.subjects), 0, 'B não vê disciplinas de A');
select pg_temp.expect_eq((select count(*) from public.search_index), 0, 'B não vê índice de busca de A');
select pg_temp.expect_eq((select count(*) from public.global_search('manguito')), 0, 'busca global de B não retorna dados de A');
select pg_temp.expect_error(
  format('insert into public.subjects (workspace_id, name) values (%L, %L)', (select ws_a from ctx), 'Invasão'),
  'B não insere no workspace pessoal de A');
select pg_temp.expect_error(
  format('insert into public.workspace_members (workspace_id, user_id, role) values (%L, %L, %L)', (select ws_a from ctx), 'bbbbbbbb-0000-0000-0000-000000000002', 'admin'),
  'B não se adiciona como membro');
select pg_temp.expect_error(
  format('select public.create_workspace_invitation(%L, %L, %L)', (select ws_a from ctx), 'x@example.com', 'viewer'),
  'B não convida para workspace de A');

-- Workspace compartilhado e papéis -------------------------------------
select pg_temp.login(:a);
select pg_temp.expect_error(
  format('select public.create_workspace_invitation(%L, %L, %L)', (select ws_a from ctx), 'bruno@example.com', 'viewer'),
  'workspace pessoal não aceita convites');
select pg_temp.expect_error(
  $q$insert into public.workspaces (name, workspace_type, is_personal, owner_id) values ('Fake', 'pessoal', true, 'aaaaaaaa-0000-0000-0000-000000000001')$q$,
  'não é possível criar um segundo workspace pessoal');

insert into public.workspaces (name, workspace_type, owner_id) values ('Liga LATO', 'liga', :a);
reset role;
alter table ctx add column ws_liga uuid, add column tok_b text, add column tok_c text, add column tok_exp text;
update ctx set ws_liga = (select id from public.workspaces where name = 'Liga LATO');
select pg_temp.login(:a);
update ctx set tok_b = (select token from public.create_workspace_invitation((select ws_liga from ctx), 'bruno@example.com', 'viewer'));
update ctx set tok_c = (select token from public.create_workspace_invitation((select ws_liga from ctx), 'carla@example.com', 'editor'));
select pg_temp.expect_eq((select count(*) from public.workspace_invitations), 2, 'admin vê convites');
select pg_temp.expect_error('select token_hash from public.workspace_invitations', 'hash do token não é legível');

insert into public.subjects (workspace_id, name) select ws_liga, 'Ortopedia' from ctx;

-- B tenta usar o token de C
select pg_temp.login(:b);
select pg_temp.expect_eq((select count(*) from public.notifications where type = 'convite'), 1, 'B recebeu notificação do convite');
select pg_temp.expect_eq((select count(*) from public.my_pending_invitations()), 1, 'B vê o próprio convite pendente');
select pg_temp.expect_error(format('select public.accept_workspace_invitation(%L)', (select tok_c from ctx)), 'convite de outro e-mail não pode ser aceito');
select pg_temp.expect_error($q$select public.accept_workspace_invitation('token-invalido')$q$, 'token inválido rejeitado');
select public.accept_workspace_invitation((select tok_b from ctx));
select pg_temp.expect_error(format('select public.accept_workspace_invitation(%L)', (select tok_b from ctx)), 'convite não pode ser reutilizado');
select pg_temp.expect_eq((select count(*) from public.subjects), 1, 'viewer B vê apenas a disciplina do workspace compartilhado');
select pg_temp.expect_error(
  format('insert into public.subjects (workspace_id, name) values (%L, %L)', (select ws_liga from ctx), 'Viewer'),
  'viewer não cria conteúdo');
update public.subjects set name = 'Alterado por viewer' where name = 'Ortopedia';
select pg_temp.expect_eq((select count(*) from public.subjects where name = 'Ortopedia'), 1, 'viewer não edita conteúdo');
delete from public.subjects where name = 'Ortopedia';
select pg_temp.expect_eq((select count(*) from public.subjects where name = 'Ortopedia'), 1, 'viewer não exclui conteúdo');
select pg_temp.expect_eq((select count(*) from public.global_search('cinesiologia')), 0, 'B não encontra a disciplina pessoal de A');

-- Editor C
select pg_temp.login(:c);
select public.accept_workspace_invitation((select tok_c from ctx));
update public.subjects set name = 'Ortopedia I' where name = 'Ortopedia';
select pg_temp.expect_eq((select count(*) from public.subjects where name = 'Ortopedia I'), 1, 'editor edita conteúdo de outros');
update public.workspace_members set role = 'admin' where user_id = :b;
select pg_temp.expect_eq((select count(*) from public.workspace_members where user_id = :b and role = 'viewer'), 1, 'editor não altera papéis');
delete from public.workspace_members where user_id = :b;
select pg_temp.expect_eq((select count(*) from public.workspace_members where user_id = :b), 1, 'editor não remove membros');
select pg_temp.expect_error(
  format('select public.create_workspace_invitation(%L, %L, %L)', (select ws_liga from ctx), 'novo@example.com', 'viewer'),
  'editor não convida (convites de membros desativados)');
select pg_temp.expect_eq((select count(*) from public.workspace_invitations), 0, 'editor não lê convites');
select pg_temp.expect_eq((select count(*) from public.workspace_audit_logs where workspace_id = (select ws_liga from ctx) and actor_id is distinct from 'cccccccc-0000-0000-0000-000000000003'), 0, 'editor não lê auditoria de outros membros');
delete from public.workspaces where name = 'Liga LATO';
select pg_temp.expect_eq((select count(*) from public.workspaces where name = 'Liga LATO'), 1, 'editor não exclui workspace');

-- Integridade entre workspaces
reset role;
alter table ctx add column ws_c uuid;
update ctx set ws_c = (select id from public.workspaces where owner_id = :c and is_personal);
select pg_temp.login(:c);
insert into public.subjects (workspace_id, name) select ws_c, 'Neuro pessoal da Carla' from ctx;
select pg_temp.expect_error(
  format('insert into public.tasks (workspace_id, title, subject_id) values (%L, %L, %L)',
         (select ws_liga from ctx), 'Tarefa cruzada', (select id from public.subjects where name = 'Neuro pessoal da Carla')),
  'referência a registro de outro workspace é rejeitada');
select pg_temp.expect_error(
  format('insert into public.entity_links (workspace_id, source_type, source_id, target_type, target_id) values (%L, %L, %L, %L, %L)',
         (select ws_liga from ctx), 'subjects', (select id from public.subjects where name = 'Ortopedia I'),
         'subjects', (select id from public.subjects where name = 'Neuro pessoal da Carla')),
  'relacionamento entre workspaces diferentes é rejeitado');
update public.subjects set workspace_id = (select ws_liga from ctx) where name = 'Neuro pessoal da Carla';
select pg_temp.expect_eq(
  (select count(*) from public.subjects where name = 'Neuro pessoal da Carla' and workspace_id = (select ws_c from ctx)), 1,
  'workspace_id de um registro é imutável');

-- Membro (member) só edita o que criou
select pg_temp.login(:a);
update public.workspace_members set role = 'member' where user_id = :c and workspace_id = (select ws_liga from ctx);
select pg_temp.expect_eq((select count(*) from public.workspace_members where user_id = :c and role = 'member'), 1, 'owner altera papel');
select pg_temp.login(:c);
insert into public.tasks (workspace_id, title) select ws_liga, 'Tarefa da Carla' from ctx;
update public.tasks set title = 'Tarefa da Carla (editada)' where title = 'Tarefa da Carla';
select pg_temp.expect_eq((select count(*) from public.tasks where title = 'Tarefa da Carla (editada)'), 1, 'member edita o próprio registro');
update public.subjects set name = 'Hack' where name = 'Ortopedia I';
select pg_temp.expect_eq((select count(*) from public.subjects where name = 'Ortopedia I'), 1, 'member não edita registro de outro');

-- Relacionamentos e limpeza
select pg_temp.login(:a);
insert into public.pathologies (workspace_id, name, specialty) select ws_liga, 'Tendinopatia do manguito rotador', 'traumato_ortopedia' from ctx;
insert into public.entity_links (workspace_id, source_type, source_id, target_type, target_id)
  select ws_liga, 'pathologies', (select id from public.pathologies limit 1), 'subjects', (select id from public.subjects where name = 'Ortopedia I') from ctx;
select pg_temp.expect_eq((select count(*) from public.entity_links), 1, 'relacionamento criado');
select pg_temp.expect_error(
  format('insert into public.entity_links (workspace_id, source_type, source_id, target_type, target_id) values (%L, %L, %L, %L, %L)',
         (select ws_liga from ctx), 'subjects', (select id from public.subjects where name = 'Ortopedia I'),
         'pathologies', (select id from public.pathologies limit 1)),
  'relacionamento duplicado (direção inversa) é rejeitado');
delete from public.pathologies;
select pg_temp.expect_eq((select count(*) from public.entity_links), 0, 'excluir registro remove relacionamentos');
select pg_temp.expect_eq((select count(*) from public.search_index where entity_type = 'pathologies'), 0, 'excluir registro remove índice de busca');

-- Privacidade de casos clínicos
select pg_temp.expect_error(
  format('insert into public.clinical_cases (workspace_id, case_code, is_real_case) values (%L, %L, true)', (select ws_a from ctx), 'CC-1'),
  'caso real exige confirmação de anonimização');
insert into public.clinical_cases (workspace_id, case_code, is_real_case, anonymization_confirmed) select ws_a, 'CC-2', true, true from ctx;

-- Testes especiais: acurácia exige fonte
select pg_temp.expect_error(
  format('insert into public.clinical_tests (workspace_id, name, sensitivity) values (%L, %L, 80)', (select ws_a from ctx), 'Teste de Neer'),
  'sensibilidade sem fonte é rejeitada');

-- Convite expirado
select pg_temp.login(:a);
update ctx set tok_exp = (select token from public.create_workspace_invitation((select ws_liga from ctx), 'expirado@example.com', 'viewer'));
reset role;
insert into auth.users (id, email) values ('dddddddd-0000-0000-0000-000000000004', 'expirado@example.com');
update public.workspace_invitations set expires_at = now() - interval '1 minute' where email = 'expirado@example.com';
select pg_temp.login('dddddddd-0000-0000-0000-000000000004');
select pg_temp.expect_error(format('select public.accept_workspace_invitation(%L)', (select tok_exp from ctx)), 'convite expirado não funciona');
select pg_temp.expect_eq((select count(*) from public.workspaces where name = 'Liga LATO'), 0, 'usuário sem convite válido não acessa o workspace');

-- Documentos e trechos (RAG)
select pg_temp.login(:a);
insert into public.documents (id, workspace_id, title, file_name, storage_path, mime_type, size_bytes, upload_status, processing_status)
  select 'eeeeeeee-0000-0000-0000-000000000001', ws_a, 'Apostila de ombro', 'ombro.pdf', ws_a || '/eeeeeeee-0000-0000-0000-000000000001/ombro.pdf',
         'application/pdf', 1000, 'enviado', 'concluido' from ctx;
insert into public.document_chunks (document_id, workspace_id, chunk_index, page_number, content)
  select 'eeeeeeee-0000-0000-0000-000000000001', ws_a, 0, 3, 'O manguito rotador é composto por supraespinal, infraespinal, redondo menor e subescapular.' from ctx;
select pg_temp.expect_eq((select count(*) from public.search_document_chunks_text('supraespinal manguito')), 1, 'A recupera o próprio trecho');
select pg_temp.expect_error(
  format('insert into public.documents (workspace_id, title, file_name, storage_path, mime_type, size_bytes) values (%L, %L, %L, %L, %L, 10)',
         (select ws_a from ctx), 'Executável', 'x.exe', (select ws_a from ctx) || '/x/x.exe', 'application/x-msdownload'),
  'tipo MIME não permitido');
select pg_temp.expect_error(
  format('insert into public.documents (workspace_id, title, file_name, storage_path, mime_type, size_bytes) values (%L, %L, %L, %L, %L, 10)',
         (select ws_a from ctx), 'Fora da pasta', 'x.pdf', (select ws_c from ctx) || '/x/x.pdf', 'application/pdf'),
  'caminho de storage precisa estar no workspace do documento');

select pg_temp.login(:b);
select pg_temp.expect_eq((select count(*) from public.search_document_chunks_text('supraespinal manguito')), 0, 'B não recupera trechos privados de A');
select pg_temp.expect_eq((select count(*) from public.document_chunks), 0, 'B não lê trechos de A');
select pg_temp.expect_error(
  format('insert into public.document_chunks (document_id, workspace_id, chunk_index, content, created_by) values (%L, %L, 1, %L, %L)',
         'eeeeeeee-0000-0000-0000-000000000001', (select ws_a from ctx), 'injeção', 'bbbbbbbb-0000-0000-0000-000000000002'),
  'B não injeta trechos no documento de A');

-- Storage: B não lê objetos do workspace de A
reset role;
insert into storage.objects (bucket_id, name) select 'documents', ws_a || '/eeeeeeee-0000-0000-0000-000000000001/ombro.pdf' from ctx;
select pg_temp.login(:b);
select pg_temp.expect_eq((select count(*) from storage.objects where bucket_id = 'documents'), 0, 'B não lista arquivos de A no Storage');
select pg_temp.login(:a);
select pg_temp.expect_eq((select count(*) from storage.objects where bucket_id = 'documents'), 1, 'A lista os próprios arquivos no Storage');

-- Exclusão de documento remove trechos indexados
delete from public.documents where id = 'eeeeeeee-0000-0000-0000-000000000001';
reset role;
select pg_temp.expect_eq((select count(*) from public.document_chunks), 0, 'excluir documento remove trechos/embeddings');

-- Conversas de IA são privadas mesmo em workspace compartilhado
select pg_temp.login(:a);
insert into public.ai_conversations (workspace_id, title) select ws_liga, 'Estudo de ombro' from ctx;
select pg_temp.login(:b);
select pg_temp.expect_eq((select count(*) from public.ai_conversations), 0, 'conversas de IA de A são privadas');

-- Notificações automáticas sem duplicidade
select pg_temp.login(:a);
insert into public.tasks (workspace_id, title, due_at) select ws_a, 'Entregar relatório', now() + interval '5 hours' from ctx;
select public.generate_my_notifications();
select public.generate_my_notifications();
select pg_temp.expect_eq((select count(*) from public.notifications where type = 'prazo'), 1, 'notificação de prazo gerada sem duplicidade');

-- Auditoria
select pg_temp.expect_eq((select count(*) from public.workspace_audit_logs where action = 'invitation.accepted'), 2, 'aceites de convite auditados');

-- Owner exclui o workspace compartilhado
delete from public.workspaces where name = 'Liga LATO';
select pg_temp.expect_eq((select count(*) from public.workspaces where name = 'Liga LATO'), 0, 'owner exclui workspace compartilhado');
reset role;
select pg_temp.expect_eq((select count(*) from public.subjects where name = 'Ortopedia I'), 0, 'conteúdo do workspace excluído é removido');
select pg_temp.expect_eq((select count(*) from public.workspace_audit_logs where action = 'workspace.deleted'), 1, 'exclusão de workspace auditada');

\echo '✔ 01_rls: todas as asserções passaram'
