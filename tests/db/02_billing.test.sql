-- Testes de assinatura, pagamentos e administração da plataforma.
\set ON_ERROR_STOP 1

create or replace function pg_temp.login(p uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p::text, false);
  execute 'set role authenticated';
end $$;
create or replace function pg_temp.expect_error(p_sql text, p_label text) returns void language plpgsql as $$
begin
  begin execute p_sql; exception when others then raise notice 'OK (erro esperado): % — %', p_label, sqlerrm; return; end;
  raise exception 'FALHA: esperado erro em "%"', p_label;
end $$;
create or replace function pg_temp.expect_eq(p_actual text, p_expected text, p_label text) returns void language plpgsql as $$
begin
  if p_actual is distinct from p_expected then raise exception 'FALHA: % — esperado %, obtido %', p_label, p_expected, p_actual; end if;
  raise notice 'OK: %', p_label;
end $$;

reset role;
insert into auth.users (id, email) values
  ('a1000000-0000-0000-0000-000000000001', 'aluno@example.com'),
  ('a2000000-0000-0000-0000-000000000002', 'outro@example.com'),
  ('a3000000-0000-0000-0000-000000000003', 'alphacode.devapps@gmail.com');

select pg_temp.expect_eq((select count(*)::text from public.subscriptions where user_id = 'a1000000-0000-0000-0000-000000000001' and trial_ends_at > now() + interval '6 days'), '1', 'novo usuário recebe 7 dias de teste');

select pg_temp.login('a1000000-0000-0000-0000-000000000001');
select pg_temp.expect_eq((select status from public.my_access()), 'teste', 'status inicial é teste');
select pg_temp.expect_eq((select allowed::text from public.my_access()), 'true', 'acesso liberado durante o teste');
select pg_temp.expect_error($q$update public.subscriptions set current_period_end = now() + interval '1 year'$q$, 'aluno não altera a própria assinatura');
select pg_temp.expect_error($q$insert into public.payments (user_id, amount_cents, status) values ('a1000000-0000-0000-0000-000000000001', 1, 'pago')$q$, 'aluno não registra pagamento');
select pg_temp.expect_error($q$select public.apply_payment(gen_random_uuid())$q$, 'aluno não aplica pagamento');
select pg_temp.expect_error($q$select * from public.admin_list_users()$q$, 'aluno não acessa a visão administrativa');
select pg_temp.expect_eq((select count(*)::text from public.platform_admin_emails), '0', 'lista de admins é invisível');

-- Teste vencido → bloqueado
reset role;
update public.subscriptions set trial_ends_at = now() - interval '1 minute' where user_id = 'a1000000-0000-0000-0000-000000000001';
select pg_temp.login('a1000000-0000-0000-0000-000000000001');
select pg_temp.expect_eq((select status || ':' || allowed::text from public.my_access()), 'vencido:false', 'após 7 dias sem pagamento o acesso é bloqueado');

-- Pagamento confirmado libera 30 dias (idempotente)
reset role;
insert into public.payments (id, user_id, amount_cents, status, paid_at) values ('b1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 3990, 'pago', now());
select public.apply_payment('b1000000-0000-0000-0000-000000000001');
select public.apply_payment('b1000000-0000-0000-0000-000000000001');
select pg_temp.expect_eq((select (current_period_end between now() + interval '29 days 23 hours' and now() + interval '30 days 1 hour')::text from public.subscriptions where user_id = 'a1000000-0000-0000-0000-000000000001'), 'true', 'pagamento libera exatamente 30 dias (aplicação idempotente)');
select pg_temp.login('a1000000-0000-0000-0000-000000000001');
select pg_temp.expect_eq((select status || ':' || allowed::text from public.my_access()), 'ativo:true', 'após o pagamento o acesso é liberado');
select pg_temp.expect_eq((select count(*)::text from public.payments), '1', 'aluno vê o próprio pagamento');

-- Pagamento antecipado acumula
reset role;
insert into public.payments (id, user_id, amount_cents, status, paid_at) values ('b2000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001', 3990, 'pago', now());
select public.apply_payment('b2000000-0000-0000-0000-000000000002');
select pg_temp.expect_eq((select (current_period_end > now() + interval '59 days')::text from public.subscriptions where user_id = 'a1000000-0000-0000-0000-000000000001'), 'true', 'pagamento antecipado soma mais 30 dias');
insert into public.payments (id, user_id, amount_cents, status) values ('b3000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000001', 3990, 'pendente');
select pg_temp.expect_error($q$select public.apply_payment('b3000000-0000-0000-0000-000000000003')$q$, 'pagamento pendente não libera acesso');

-- Bloqueio manual
update public.subscriptions set manually_blocked = true where user_id = 'a1000000-0000-0000-0000-000000000001';
select pg_temp.login('a1000000-0000-0000-0000-000000000001');
select pg_temp.expect_eq((select status || ':' || allowed::text from public.my_access()), 'bloqueado:false', 'bloqueio manual prevalece');

-- Isolamento entre alunos
select pg_temp.login('a2000000-0000-0000-0000-000000000002');
select pg_temp.expect_eq((select count(*)::text from public.payments), '0', 'aluno não vê pagamentos de outro');
select pg_temp.expect_eq((select count(*)::text from public.subscriptions), '1', 'aluno vê somente a própria assinatura');

-- Administrador
select pg_temp.login('a3000000-0000-0000-0000-000000000003');
select pg_temp.expect_eq((select status || ':' || allowed::text from public.my_access()), 'admin:true', 'admin sempre tem acesso');
select pg_temp.expect_eq((select (count(*) >= 3)::text from public.admin_list_users()), 'true', 'admin lista todos os usuários');
select pg_temp.expect_eq((select status from public.admin_list_users() where email = 'aluno@example.com'), 'bloqueado', 'admin vê o status de cada aluno');
select pg_temp.expect_eq((select total_paid_cents::text from public.admin_list_users() where email = 'aluno@example.com'), '7980', 'admin vê o total pago');
select pg_temp.expect_eq((select count(*)::text from public.payments), '3', 'admin vê todos os pagamentos');

-- Escrita bloqueada no banco sem acesso ativo
reset role;
update public.subscriptions set manually_blocked = false, current_period_end = null, trial_ends_at = now() - interval '1 day' where user_id = 'a2000000-0000-0000-0000-000000000002';
select pg_temp.login('a2000000-0000-0000-0000-000000000002');
select pg_temp.expect_error(
  format('insert into public.subjects (workspace_id, name) values (%L, %L)', (select id from public.workspaces where owner_id = 'a2000000-0000-0000-0000-000000000002' and is_personal), 'Sem pagamento'),
  'sem acesso ativo o banco recusa criar conteúdo');
reset role;
update public.subscriptions set trial_ends_at = now() + interval '1 day' where user_id = 'a2000000-0000-0000-0000-000000000002';
select pg_temp.login('a2000000-0000-0000-0000-000000000002');
insert into public.subjects (workspace_id, name) select id, 'Com acesso' from public.workspaces where owner_id = 'a2000000-0000-0000-0000-000000000002' and is_personal;
select pg_temp.expect_eq((select count(*)::text from public.subjects where name = 'Com acesso'), '1', 'com acesso ativo a escrita volta a funcionar');
