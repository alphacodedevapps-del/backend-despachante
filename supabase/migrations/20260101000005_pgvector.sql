-- =====================================================================
-- Migration 0005: busca semântica com pgvector + busca híbrida.
-- Dimensão padrão 1536 (OpenAI text-embedding-3-small). Se mudar o modelo
-- de embeddings para outra dimensão, crie uma nova migration ajustando a
-- coluna e reprocesse os documentos.
-- =====================================================================

create extension if not exists vector with schema extensions;

alter table public.document_chunks add column embedding extensions.vector(1536);

create index document_chunks_embedding_idx on public.document_chunks
  using hnsw (embedding extensions.vector_cosine_ops);

-- Busca híbrida (Reciprocal Rank Fusion entre similaridade vetorial e texto).
-- SECURITY INVOKER: RLS + filtro explícito por workspaces do usuário são
-- aplicados ANTES de qualquer ranqueamento.
create or replace function public.match_document_chunks(
  p_query_embedding extensions.vector(1536),
  p_query text,
  p_workspace_id uuid default null,
  p_document_ids uuid[] default null,
  p_limit integer default 8
)
returns table (
  chunk_id uuid,
  document_id uuid,
  workspace_id uuid,
  document_title text,
  file_name text,
  page_number integer,
  chunk_index integer,
  content text,
  score real
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_k constant integer := 60;
  v_or_query tsquery;
  v_limit integer := least(greatest(coalesce(p_limit, 8), 1), 50);
begin
  select to_tsquery('simple', string_agg(t || ':*', ' | '))
    into v_or_query
    from (
      select regexp_replace(w, '[^[:alnum:]]', '', 'g') as t
        from regexp_split_to_table(public.normalize_search(coalesce(p_query, '')), '\s+') as w
    ) s
   where length(t) > 2;

  return query
  with allowed as (
    select c.id, c.document_id, c.workspace_id, c.page_number, c.chunk_index, c.content, c.embedding, c.fts,
           d.title, d.file_name
      from public.document_chunks c
      join public.documents d on d.id = c.document_id
     where c.workspace_id in (select public.my_workspace_ids())
       and (p_workspace_id is null or c.workspace_id = p_workspace_id)
       and (p_document_ids is null or c.document_id = any (p_document_ids))
       and d.processing_status = 'concluido'
  ),
  semantic as (
    select a.id, row_number() over (order by a.embedding operator(extensions.<=>) p_query_embedding) as r
      from allowed a
     where a.embedding is not null and p_query_embedding is not null
     order by a.embedding operator(extensions.<=>) p_query_embedding
     limit v_limit * 4
  ),
  lexical as (
    select a.id, row_number() over (order by ts_rank_cd(a.fts, v_or_query) desc) as r
      from allowed a
     where v_or_query is not null and a.fts @@ v_or_query
     order by ts_rank_cd(a.fts, v_or_query) desc
     limit v_limit * 4
  ),
  fused as (
    select coalesce(s.id, l.id) as id,
           (coalesce(1.0 / (v_k + s.r), 0) + coalesce(1.0 / (v_k + l.r), 0))::real as score
      from semantic s
      full outer join lexical l on l.id = s.id
  )
  select a.id, a.document_id, a.workspace_id, a.title, a.file_name, a.page_number, a.chunk_index, a.content, f.score
    from fused f
    join allowed a on a.id = f.id
   order by f.score desc
   limit v_limit;
end;
$$;
