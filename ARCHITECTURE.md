# Arquitetura

## Visão geral

```
Navegador ──► Next.js (App Router)
               ├─ proxy.ts ............ renova sessão Supabase, protege rotas
               ├─ Server Components ... leitura com o cliente do usuário (RLS)
               ├─ Server Actions ...... escrita validada (Zod) + RLS
               ├─ Route Handlers ...... /api/assistant/chat, /api/export, /auth/callback
               └─ after() ............. processamento assíncrono de documentos
                         │
                         ▼
               Supabase: PostgreSQL (RLS, triggers, RPCs, pgvector) · Auth · Storage
                         │
                         ▼
               Provedores de IA (somente servidor): Anthropic (SDK oficial) / OpenAI
```

Princípios: **o banco é a fonte de verdade da autorização** (RLS em todas as tabelas privadas); o servidor valida tudo novamente; o cliente nunca recebe chaves secretas; nenhuma funcionalidade usa dados simulados ou `localStorage` como banco (o `localStorage` guarda apenas o cache do tema do `next-themes`; a preferência real fica em `user_preferences`).

## Motor genérico de entidades

`src/modules/entities/definitions.ts` descreve 37 entidades (campos, tipos, opções, referências, seções, avisos, regras). A partir dele:

| Saída | Onde |
|---|---|
| Tabelas, CHECKs, FKs, índices, triggers e RLS | `scripts/generate-entity-sql.ts` → `supabase/migrations/…002_entities.sql` |
| Validação (cliente e servidor) | `modules/entities/schema.ts` (Zod + normalização + sanitização) |
| Formulário (React Hook Form, resolver Zod) | `components/entity-form.tsx` |
| Listagem (busca, filtros, favoritos, paginação, status inline, mobile) | `app/(app)/[entity]/page.tsx` |
| Detalhe (seções, registros vinculados, relacionados, arquivos, IA) | `app/(app)/[entity]/[id]/page.tsx` |

**Visões** (`ENTITY_VIEWS`) expõem subconjuntos de uma tabela como páginas próprias (ex.: Reuniões, Aulas e palestras, Eventos e congressos → `league_activities`). **Extensões** (`extensions.tsx`) adicionam blocos específicos ao detalhe (ABNT e coleções no artigo, etapas no projeto, progresso na disciplina, revisão no flashcard, horas no estágio, ferramentas de IA). **Listas customizadas** (`custom-lists.tsx`) adicionam Kanban de projetos, banner de revisão, "TESTAR MEUS CONHECIMENTOS" e resumo de horas.

## Workspaces e autorização

Todo conteúdo tem `workspace_id` e `created_by`. Funções `SECURITY DEFINER` (`workspace_role`, `is_workspace_member`, `can_write_workspace`, `can_edit_row`, `is_workspace_admin`) evitam recursão de RLS. O workspace atual fica em cookie httpOnly (`ca_ws`) e em `user_preferences.default_workspace_id`. Detalhes em [SECURITY.md](SECURITY.md).

## Relacionamentos e busca

- `entity_links`: relação bidirecional genérica entre quaisquer registros (inclusive documentos), validada por trigger (mesmo workspace, normalização da ordem, sem duplicatas).
- `search_index`: mantido por trigger genérico em cada tabela (título, subtítulo, corpo, `tsvector` sem acentos). A busca global (`global_search`) usa prefixos + trigramas e aplica autorização antes de ranquear. O mesmo trigger limpa links e índice quando um registro é excluído.
- FKs específicas (ex.: `tasks.subject_id`) também alimentam "Registros vinculados" automaticamente.

## Documentos e RAG

Upload direto ao Storage por URL assinada (progresso real via XHR) → `finalizeUploadAction` confere o objeto e agenda `processDocument` com `after()` → download → verificação de assinatura binária → extração (PDF com `unpdf`; DOCX/PPTX/XLSX com leitor ZIP próprio) → divisão em trechos com página → embeddings (opcional) → `document_chunks`. Estados: aguardando, processando, concluído, falha, sem texto indexável. Ver [AI_INTEGRATION.md](AI_INTEGRATION.md).

## Interface

Design tokens em `globals.css` (temas claro e escuro definidos separadamente; tema automático segue o SO; sem flash via script do `next-themes` + valor inicial vindo do perfil). Layout: sidebar recolhível (preferência salva), cabeçalho com seletor de workspace, busca global (Ctrl+K), notificações e perfil; no mobile, drawer de navegação + barra inferior. Gráficos Recharts com paleta categórica validada para daltonismo e contraste nos dois temas, legenda, tooltip e tabela alternativa.
