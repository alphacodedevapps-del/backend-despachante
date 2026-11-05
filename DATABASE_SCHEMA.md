# Esquema do banco de dados

PostgreSQL (Supabase) com UUID, `created_at`/`updated_at`, `workspace_id`, `created_by`, FKs com regras de exclusão explícitas, CHECKs e RLS em todas as tabelas privadas. Migrations em `supabase/migrations/`.

## Núcleo

| Tabela | Finalidade |
|---|---|
| `profiles` | dados do usuário (1:1 com `auth.users`) |
| `user_preferences` | tema, workspace padrão, notificações, calendário, revisão espaçada, IA |
| `workspaces` | pessoal / grupo de estudos / liga / projeto / institucional (um pessoal por usuário) |
| `workspace_members` | papéis owner, admin, editor, member, viewer (um owner por workspace) |
| `workspace_invitations` | convites por e-mail com **hash** do token, expiração, revogação e uso único |
| `workspace_settings` | convites por membros, papel padrão, validade, IA habilitada |
| `workspace_audit_logs` | auditoria (membros, convites, workspace, exclusões de arquivos, exportações) |
| `search_index` | índice de busca global (mantido por trigger) |
| `entity_links` | relacionamentos entre módulos ("Conteúdos relacionados") |
| `notifications` | notificações internas com `dedupe_key` única por usuário |

## Conteúdo (gerado a partir do registro de entidades)

| Tabela | Módulo | Rota | Referências |
|---|---|---|---|
| `semesters` | Semestres | /semestres | — |
| `professors` | Professores | /professores | — |
| `subjects` | Disciplinas | /disciplinas | semester_id → semesters, professor_id → professors |
| `library_folders` | Pastas | /pastas | parent_id → library_folders, subject_id → subjects |
| `study_notes` | Caderno de estudos | /caderno | subject_id → subjects |
| `events` | Eventos da agenda | /eventos | subject_id → subjects, project_id → projects |
| `tasks` | Tarefas | /tarefas | subject_id → subjects, project_id → projects |
| `assessments` | Avaliações e provas | /provas | subject_id → subjects |
| `articles` | Artigos científicos | /artigos | — |
| `article_collections` | Coleções de artigos | /colecoes | — |
| `article_notes` | Fichamentos | /fichamentos | article_id → articles |
| `citations` | Referências bibliográficas | /referencias | article_id → articles |
| `pathologies` | Banco de patologias | /patologias | — |
| `anatomical_structures` | Atlas anatômico | /atlas | — |
| `exercises` | Banco de exercícios | /exercicios | — |
| `clinical_tests` | Testes especiais | /testes | — |
| `protocols` | Protocolos clínicos | /protocolos | — |
| `medications` | Farmacologia | /farmacologia | — |
| `clinical_cases` | Casos clínicos | /casos-clinicos | — |
| `clinical_assessments` | Avaliações clínicas | /avaliacoes-clinicas | case_id → clinical_cases |
| `clinical_plans` | Planejamento terapêutico | /planejamento-terapeutico | case_id → clinical_cases |
| `clinical_interventions` | Intervenções | /intervencoes | case_id → clinical_cases, exercise_id → exercises |
| `clinical_evolutions` | Evoluções | /evolucoes | case_id → clinical_cases |
| `flashcards` | Flashcards | /flashcards | subject_id → subjects |
| `questions` | Banco de questões | /questoes | subject_id → subjects |
| `projects` | Trabalhos e projetos | /projetos | subject_id → subjects |
| `league_activities` | Projetos e atividades da liga | /liga-atividades | — |

Todas possuem `tags text[]` quando aplicável, `is_favorite` quando o módulo tem favoritos, e colunas de sistema específicas (ex.: `flashcards.ease_factor`, `interval_days`, `next_review_at`; `tasks.completed_at`).

Tabelas removidas na migration 0006 (escopo simplificado): `study_goals`, `glossary_terms`, `clinical_conducts`, `league_members`, `league_profiles`, `certificates`, `complementary_activities`, `internships`, `internship_logs`, `portfolio_items`, `professional_goals`.

Regras de integridade relevantes:
- `clinical_cases`: caso real exige `anonymization_confirmed`.
- `clinical_tests`: sensibilidade/especificidade exigem `accuracy_source`.
- `questions`: objetivas exigem ≥ 2 alternativas e gabarito válido.
- Datas de término ≥ início; notas ≤ nota máxima; URLs apenas http(s); opções restritas por CHECK.
- Trigger por tabela garante que referências (FKs) apontem para registros do **mesmo workspace**.
- Trigger `protect_ownership` impede alterar `workspace_id`, `created_by` e `created_at`.

## Apoio, estudos e liga

| Tabela | Finalidade |
|---|---|
| `documents` | metadados de arquivos (o binário fica no Storage; caminho `{workspace}/{documento}/{arquivo}`) |
| `article_collection_items` | artigos ↔ coleções |
| `project_stages` | etapas personalizadas (progresso) |
| `flashcard_reviews` | histórico de revisões |
| `quizzes`, `quiz_questions`, `quiz_attempts` | simulados, questões sorteadas e tentativas corrigidas no servidor |

## Assinatura e administração

| Tabela | Finalidade |
|---|---|
| `subscriptions` | uma por usuário: fim do teste (7 dias), fim do período pago, último pagamento, bloqueio manual, observação do admin |
| `payments` | pagamentos (PagBank ou manual): status, valor, checkout/pedido/cobrança, método, data, aplicação do período |
| `platform_admin_emails` | e-mails com acesso ao painel do administrador (sem senha; inacessível pela API) |

Funções: `my_access()` (situação do usuário logado), `has_active_access()` (usada pelas políticas de escrita), `apply_payment()` (somente servidor, idempotente, +30 dias), `admin_list_users()` (somente admin). Sem acesso ativo, `can_write_workspace`/`can_edit_row` retornam falso: o banco recusa criar ou alterar conteúdo.

## IA

| Tabela | Finalidade |
|---|---|
| `ai_conversations` | conversas (privadas do autor), assunto e contexto de módulo |
| `ai_messages` | mensagens com citações (`jsonb`), provedor, modelo e tokens |
| `ai_usage_logs` | uso, status, latência e custo estimado |
| `document_chunks` | trechos com página, posição, `fts` e `embedding vector(1536)` |
| `document_processing_jobs` | tentativas de processamento e estatísticas |

## Funções (RPC)

`global_search`, `search_document_chunks_text`, `match_document_chunks` (híbrida), `create_workspace_invitation`, `accept_workspace_invitation`, `accept_workspace_invitation_by_id`, `my_pending_invitations`, `transfer_workspace_ownership`, `generate_my_notifications`, `log_workspace_event`, além das funções de autorização usadas pela RLS.

## Exclusões

- Excluir workspace → cascata em todo o conteúdo, membros, convites, trechos e índice (arquivos do Storage são removidos pela aplicação antes).
- Excluir registro → trigger remove `entity_links` e `search_index`; filhos com `on delete cascade` (fichamentos, avaliações/planos/intervenções/evoluções do caso).
- Excluir documento → objeto do Storage removido primeiro; trechos/embeddings em cascata.
- Excluir conta → `auth.users` em cascata (perfil, workspaces próprios); conteúdo em workspaces de terceiros fica sem autoria (`set null`).
