# Status do projeto

Última atualização: 05/11/2026.

## Mudança de escopo (05/11/2026)

A pedido do usuário foram **removidos**: metas acadêmicas, desempenho acadêmico, glossário técnico, calculadoras, biblioteca de condutas, painel/membros/reuniões/aulas e palestras/eventos e congressos/certificados da liga e todo o desenvolvimento profissional (estágios, experiências, horas complementares, certificados e cursos, currículo, Lattes, portfólio, metas profissionais). A Liga mantém Traumatologia, Ortopedia (base por região anatômica) e Projetos e atividades. Migration `…006` remove as tabelas correspondentes.

**Adicionado:** importação de artigo científico por imagem (câmera ou PNG/JPG do dispositivo) com leitura por IA e preenchimento automático do formulário para revisão.

## Concluído

| Fase | Itens |
|---|---|
| 1 — Fundação | Next.js 16 + TS strict, design system (tokens claro/escuro/automático), layout responsivo (sidebar recolhível, cabeçalho, busca Ctrl+K, seletor de workspace, notificações, menu mobile e barra inferior), Supabase SSR, autenticação completa, perfil, migrations e RLS |
| 2 — Organização acadêmica | Semestres, professores, disciplinas (progresso, ementa, bibliografia, conteúdos estudados/pendentes), biblioteca com pastas/subpastas, upload/visualização/download, caderno de estudos, agenda mensal/semanal/diária com recorrência e categorias, tarefas, avaliações e provas |
| 3 — Pesquisa e estudos | Artigos (metadados completos, leitura crítica, status, favoritos, filtros, **importação por imagem com IA**), fichamentos + exportação Markdown, coleções, referências ABNT a partir de metadados (sem inventar dados), flashcards com revisão espaçada configurável, banco de questões, simulados com filtros/cronômetro/correção no servidor/histórico |
| 4 — Conhecimento clínico | Patologias, atlas anatômico, exercícios, testes especiais (acurácia só com fonte), avaliação fisioterapêutica por categoria, protocolos, farmacologia (aviso de não prescrição) |
| 5 — Prática clínica | Casos clínicos anonimizados (avisos, bloqueio sem confirmação), avaliações, planejamento terapêutico, intervenções, evoluções, relacionamentos |
| 6 — Liga e produção científica | Base de conhecimento por região anatômica (traumatologia/ortopedia), projetos e atividades da liga, projetos com Kanban e etapas |
| 8 — Multiworkspace | Criação/edição/exclusão com confirmação, alternância, convites seguros (hash, expiração, uso único), papéis, remoção, transferência de propriedade, preferências, auditoria |
| 9 — IA | Provedores configuráveis (Anthropic SDK / OpenAI), RAG com pgvector e busca híbrida, processamento de PDF/DOCX/PPTX/XLSX, citações, limites e registro de uso, contexto por módulo, geração com aprovação |
| 10 — Refinamento | Busca global com filtros, notificações (preferências, sem duplicidade), dashboard com dados reais, exportação LGPD, exclusão de conta, testes, build |

## Verificação

- `npm run typecheck` ✔ · `npm run lint` ✔ (1 aviso informativo do React Compiler sobre `watch` do React Hook Form) · `npm test` ✔ 46 testes · `npm run test:db` ✔ 63 asserções de RLS/integridade · `npm run build` ✔ (50 rotas).
- Os testes de banco rodam em PostgreSQL 16 local com stub do Supabase; a migration de pgvector (`…005`) não foi executada localmente (extensão indisponível no ambiente de desenvolvimento) — validar no Supabase.
- Ainda **não testado contra um projeto Supabase real** nem com chaves de IA reais (não disponíveis no ambiente de desenvolvimento).

## Implantação

- Supabase: projeto `central-academica` (São Paulo), migrations 0001–0006 aplicadas.
- Netlify: https://central-academica-fisioterapia.netlify.app
- Pendente: `ANTHROPIC_API_KEY` (e opcionalmente `OPENAI_API_KEY`) nas variáveis da Netlify para ativar o assistente e a leitura de imagens.

## Próximas tarefas sugeridas

1. Aplicar as migrations em um projeto Supabase e executar um roteiro manual de aceitação (cadastro → workspace → upload de PDF → pergunta à IA com citação).
2. Testes E2E com Playwright contra Supabase local (`supabase start`).
3. OCR para PDFs digitalizados e imagens (hoje marcados como "sem texto indexável").
4. Rotina agendada (pg_cron/Edge Function) para notificações sem acesso ao app e e-mails de lembrete.
5. Streaming das respostas da IA.
6. Importação de metadados de artigos por DOI (Crossref), sempre com revisão manual.
