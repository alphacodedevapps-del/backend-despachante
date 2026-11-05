# Central Acadêmica — Fisioterapia

Plataforma web para acompanhar a trajetória acadêmica, científica, clínica e profissional de estudantes de Fisioterapia: disciplinas, biblioteca digital, artigos e fichamentos, patologias, exercícios, testes especiais, casos clínicos anonimizados, liga acadêmica, agenda, simulados com revisão espaçada, estágios, portfólio e um **Assistente acadêmico com IA (RAG)** que consulta somente os materiais autorizados do usuário.

**Stack:** Next.js 16 (App Router) · React 19 · TypeScript strict · Tailwind CSS 4 · componentes no estilo shadcn/ui (Radix) · Lucide · Supabase (PostgreSQL, Auth, Storage, RLS) · pgvector · React Hook Form + Zod · Recharts · date-fns · Vitest.

> Documentação complementar: [ARCHITECTURE.md](ARCHITECTURE.md) · [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md) · [SECURITY.md](SECURITY.md) · [AI_INTEGRATION.md](AI_INTEGRATION.md) · [PROJECT_STATUS.md](PROJECT_STATUS.md)

---

## 1. Requisitos

- Node.js 20.9+ (testado com Node 22) e npm
- Um projeto Supabase (gratuito serve) — ou Supabase CLI + Docker para rodar localmente
- Opcional: chave da Anthropic e/ou OpenAI para a IA

## 2. Instalação

```bash
npm install
cp .env.example .env.local   # preencha os valores (veja a seção 4)
```

## 3. Configuração do Supabase

### 3.1 Projeto na nuvem
1. Crie um projeto em <https://supabase.com>.
2. **Extensões:** o projeto já possui `pgcrypto`, `pg_trgm`, `unaccent` e `vector` disponíveis (as migrations as habilitam no schema `extensions`).
3. **Aplique as migrations** (em ordem):
   - Com a CLI: `npx supabase link --project-ref SEU_REF` e depois `npx supabase db push`; **ou**
   - No *SQL Editor*, execute o conteúdo de cada arquivo de `supabase/migrations/` na ordem numérica.
4. **Auth → URL Configuration:** defina *Site URL* (ex.: `https://seu-dominio`) e adicione `https://seu-dominio/auth/callback` em *Redirect URLs* (confirmação de e-mail e redefinição de senha).
5. **Auth → Providers → Email:** mantenha *Confirm email* ativado (recomendado).
6. Os buckets de Storage `documents` (50 MB, PDF/DOCX/PPTX/XLSX/PNG/JPG) e `avatars` (2 MB, PNG/JPG) e suas políticas são criados pela migration `…003`. Ambos são **privados**.

### 3.2 Migrations

| Arquivo | Conteúdo |
|---|---|
| `20260101000001_core.sql` | perfis, preferências, workspaces, membros, convites, configurações, auditoria, funções de autorização, índice de busca, relacionamentos, notificações, RLS do núcleo |
| `20260101000002_entities.sql` | 37 tabelas de conteúdo **geradas** a partir de `src/modules/entities/definitions.ts` (colunas, CHECKs, FKs, índices, triggers e RLS) |
| `20260101000003_documents_studies_extras.sql` | documentos, coleções, etapas de projeto, revisões de flashcards, simulados, perfil da liga, notificações automáticas, Storage |
| `20260101000004_ai.sql` | conversas, mensagens, uso de IA, trechos de documentos, fila de processamento, busca textual em trechos |
| `20260101000005_pgvector.sql` | coluna `embedding vector(1536)`, índice HNSW e busca híbrida `match_document_chunks` |

Se alterar o registro de entidades, regenere a migration de conteúdo: `node scripts/generate-entity-sql.ts` (em produção, crie **nova** migration com o `ALTER TABLE` correspondente em vez de editar uma já aplicada).

### 3.3 Supabase local (opcional)
```bash
npx supabase start      # requer Docker
npx supabase db reset   # aplica as migrations
```
Use as chaves exibidas pelo `supabase start` no `.env.local`.

## 4. Variáveis de ambiente

| Variável | Onde | Obrigatória | Descrição |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | cliente+servidor | sim | URL do projeto |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | cliente+servidor | sim | chave **anon** (pública; a RLS protege os dados) |
| `SUPABASE_SERVICE_ROLE_KEY` | **somente servidor** | para exclusão de conta | nunca exposta ao navegador |
| `NEXT_PUBLIC_SITE_URL` | servidor | sim | URL pública (links de convite e e-mails) |
| `AI_CHAT_PROVIDER` | servidor | não | `anthropic` (padrão) ou `openai` |
| `AI_CHAT_MODEL` | servidor | não | padrão `claude-opus-5-5` |
| `AI_EFFORT` | servidor | não | esforço de raciocínio (Anthropic): `low`…`max` ou `none` |
| `AI_EMBEDDING_PROVIDER` / `AI_EMBEDDING_MODEL` | servidor | não | `openai` / `text-embedding-3-small` (1536 dim.) |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` | servidor | não | chaves dos provedores |
| `AI_DAILY_REQUEST_LIMIT`, `AI_MONTHLY_TOKEN_LIMIT`, `AI_MAX_OUTPUT_TOKENS` | servidor | não | limites por usuário |
| `AI_COST_*_PER_MTOK` | servidor | não | custos para estimativa no registro de uso |

Sem as variáveis do Supabase, a aplicação redireciona para `/configuracao` com instruções. Sem chaves de IA, a interface do assistente continua disponível e informa que a integração precisa ser configurada — **nenhuma resposta é simulada**.

## 5. Execução local

```bash
npm run dev        # http://localhost:3000
```
Crie uma conta em `/cadastro`. Um **workspace pessoal privado** é criado automaticamente.

## 6. Testes e qualidade

```bash
npm run typecheck  # TypeScript strict
npm run lint       # ESLint (config do Next)
npm test           # Vitest: regras de domínio, validação, permissões, IA (45 testes)
npm run test:db    # migrations + RLS em PostgreSQL local com stub do Supabase (63 asserções)
npm run build      # build de produção
```

`npm run test:db` cria um banco temporário, aplica um stub mínimo de `auth`/`storage`/papéis do Supabase (`tests/db/supabase-stub.sql`) e executa `tests/db/*.test.sql`. Variáveis: `TEST_DB_URL` (opcional) ou execução via usuário `postgres` local. A migration do pgvector é pulada se a extensão não estiver instalada localmente.

## 7. Deploy

**Vercel (recomendado):** importe o repositório, configure as variáveis da seção 4 (marque `SUPABASE_SERVICE_ROLE_KEY` e chaves de IA apenas para o ambiente de servidor), e faça o deploy. Atualize *Site URL* e *Redirect URLs* no Supabase com o domínio final.

**Netlify:** o `netlify.toml` já está pronto (o runtime oficial de Next.js é aplicado automaticamente). Para publicar pela CLI a partir de um build local: `netlify build` e depois `netlify deploy --prod --no-build --dir .netlify/static` — a pasta publicada deve ser `.netlify/static` (gerada pelo runtime), não `.next`.

**Outro host Node:** `npm run build && npm start` (porta 3000). O processamento de documentos roda após a resposta (`after()` do Next); em ambientes serverless, `maxDuration` está configurado nas rotas de IA.

**Notificações:** são geradas de forma idempotente a cada acesso ao app (`generate_my_notifications`). Para gerar sem acesso, agende via `pg_cron` uma rotina equivalente por usuário (opcional).

## 8. Estrutura

```
src/
  app/                 rotas (App Router): (auth), (app), api
  components/          ui/ (design system), layout/, dashboard/, charts/, shared/
  modules/             entities (motor genérico), documents, assistant, relations,
                       workspaces, studies, projects, research, league, professional,
                       account, notifications, dashboard, shell, auth
  lib/                 supabase/, ai/, domain/ (ABNT, SRS, simulados, calculadoras,
                       recorrência), utils/, session, permissions, errors
supabase/migrations/   SQL versionado
scripts/               gerador de SQL e testes de banco
tests/                 unit/ (Vitest) e db/ (SQL)
```
