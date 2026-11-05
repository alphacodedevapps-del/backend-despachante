# Status do projeto

Última atualização: 05/11/2026.

## Concluído

| Fase | Itens |
|---|---|
| 1 — Fundação | Next.js 16 + TS strict, design system (tokens claro/escuro/automático), layout responsivo (sidebar recolhível, cabeçalho, busca Ctrl+K, seletor de workspace, notificações, menu mobile e barra inferior), Supabase SSR, autenticação completa, perfil, migrations e RLS |
| 2 — Organização acadêmica | Semestres, professores, disciplinas (progresso, ementa, bibliografia, conteúdos estudados/pendentes), biblioteca com pastas/subpastas, upload/visualização/download, caderno de estudos, agenda mensal/semanal/diária com recorrência e categorias, tarefas, avaliações e provas |
| 3 — Pesquisa e estudos | Artigos (metadados completos, leitura crítica, status, favoritos, filtros), fichamentos + exportação Markdown, coleções, referências ABNT a partir de metadados (sem inventar dados), flashcards com revisão espaçada configurável, banco de questões, simulados com filtros/cronômetro/correção no servidor/histórico |
| 4 — Conhecimento clínico | Patologias, atlas anatômico, exercícios, testes especiais (acurácia só com fonte), avaliação fisioterapêutica por categoria, protocolos, farmacologia (aviso de não prescrição), glossário, calculadoras documentadas |
| 5 — Prática clínica | Casos clínicos anonimizados (avisos, bloqueio sem confirmação), avaliações, planejamento terapêutico, intervenções, evoluções, biblioteca de condutas, relacionamentos |
| 6 — Liga e produção científica | Painel da liga, perfil, membros e cargos, reuniões, aulas e palestras, eventos e congressos, projetos, certificados, base por região anatômica (traumatologia/ortopedia), projetos com Kanban e etapas |
| 7 — Desenvolvimento profissional | Estágios + registros de horas, experiências, horas complementares, certificados e cursos, portfólio, currículo imprimível, organização para o Lattes, metas profissionais |
| 8 — Multiworkspace | Criação/edição/exclusão com confirmação, alternância, convites seguros (hash, expiração, uso único), papéis, remoção, transferência de propriedade, preferências, auditoria |
| 9 — IA | Provedores configuráveis (Anthropic SDK / OpenAI), RAG com pgvector e busca híbrida, processamento de PDF/DOCX/PPTX/XLSX, citações, limites e registro de uso, contexto por módulo, geração com aprovação |
| 10 — Refinamento | Busca global com filtros, notificações (preferências, sem duplicidade), dashboard e desempenho com dados reais, exportação LGPD, exclusão de conta, testes, build |

## Verificação

- `npm run typecheck` ✔ · `npm run lint` ✔ (1 aviso informativo do React Compiler sobre `watch` do React Hook Form) · `npm test` ✔ 45 testes · `npm run test:db` ✔ 63 asserções de RLS/integridade · `npm run build` ✔ (50 rotas).
- Os testes de banco rodam em PostgreSQL 16 local com stub do Supabase; a migration de pgvector (`…005`) não foi executada localmente (extensão indisponível no ambiente de desenvolvimento) — validar no Supabase.
- Ainda **não testado contra um projeto Supabase real** nem com chaves de IA reais (não disponíveis no ambiente de desenvolvimento).

## Próximas tarefas sugeridas

1. Aplicar as migrations em um projeto Supabase e executar um roteiro manual de aceitação (cadastro → workspace → upload de PDF → pergunta à IA com citação).
2. Testes E2E com Playwright contra Supabase local (`supabase start`).
3. OCR para PDFs digitalizados e imagens (hoje marcados como "sem texto indexável").
4. Rotina agendada (pg_cron/Edge Function) para notificações sem acesso ao app e e-mails de lembrete.
5. Streaming das respostas da IA.
6. Importação de metadados de artigos por DOI (Crossref), sempre com revisão manual.
