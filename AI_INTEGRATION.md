# Integração de IA — Assistente acadêmico

## Provedores
Camada em `src/lib/ai/`:
- `config.ts` — leitura das variáveis (somente servidor) e `publicAiStatus()` sem segredos.
- `providers/anthropic.ts` — SDK oficial `@anthropic-ai/sdk` (Messages API). Padrão `claude-opus-5-5`, `output_config.effort` configurável (`AI_EFFORT`, padrão `medium`) e **fallback de recusa no servidor** (`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`) nos modelos que o suportam; `stop_reason: "refusal"` é tratado com mensagem amigável. Erros tipados do SDK são normalizados (`AiError`: `auth`, `rate_limited`, `bad_request`, `provider`, `cancelled`, `refusal`, `limit`, `not_configured`).
- `providers/openai.ts` — Chat Completions e Embeddings via `fetch` (sem SDK), mesmo contrato.
- `index.ts` — `getChatProvider()` (lança `not_configured` sem chave — **nunca simula resposta**), `embedTexts()`, `toPgVector()`.
- `usage.ts` — limites (`AI_DAILY_REQUEST_LIMIT`, `AI_MONTHLY_TOKEN_LIMIT`) e registro em `ai_usage_logs` com custo estimado.

Cancelamento: o botão "parar" aborta o `fetch`; o servidor repassa `request.signal` ao provedor.

## Fluxo RAG
1. Upload ao Storage (`documents`) por URL assinada.
2. `finalizeUploadAction` confirma o objeto e agenda o processamento com `after()`.
3. Extração de texto por página (PDF: `unpdf`; PPTX por slide; XLSX por planilha; DOCX).
4. Divisão em trechos (~1.400 caracteres, sobreposição de 200, cortes em parágrafos/frases) com página e posição.
5. Embeddings (OpenAI `text-embedding-3-small`, 1536 dim.) quando configurado; caso contrário, apenas busca textual.
6. Gravação em `document_chunks` (`content`, `page_number`, `chunk_index`, `embedding_model`, `created_at`; título e nome do arquivo via `documents`).
7. Pergunta do usuário → `retrieveContext()`:
   - **Sem contexto:** registros do workspace via `global_search` + trechos via `match_document_chunks` (híbrida RRF vetor+texto) ou `search_document_chunks_text`, além de um panorama (pendências, revisões, próximas provas) para perguntas de planejamento.
   - **Com contexto de módulo** (`?contexto=tipo:id`, ex.: a partir de um artigo, disciplina ou patologia): somente o registro, seus relacionados e os trechos dos seus anexos.
8. O modelo recebe as fontes numeradas em `<fonte>` e responde citando `[n]`; a interface mostra as fontes com links e página.

Documentos só entram na recuperação com `processing_status = 'concluido'`. Reprocessar remove os trechos anteriores; excluir o documento remove trechos e embeddings em cascata.

## Importação de artigo por imagem
Em **Artigos → Novo** (e em Editar), o painel "Preencher a partir de imagem" permite **tirar foto** (câmera do celular) ou **escolher imagens** PNG/JPG/WebP das páginas do artigo (até 6 por leitura).
1. O navegador reduz cada imagem (lado máximo 1.800 px, JPEG) antes do envio.
2. `extractArticleFromImagesAction` valida tipo pela assinatura binária e tamanho (≤ 4 MB), aplica os limites de uso e envia as imagens ao provedor com visão (Anthropic: blocos `image` base64; OpenAI: `image_url` em data URL).
3. O modelo devolve JSON com título, autores, ano, DOI, revista, volume, número, páginas, URL, palavras-chave, área, tipo de estudo, objetivo, metodologia, amostra, resultados, conclusão e limitações. A resposta é validada com Zod (`research/article-extract.ts`): valores ilegíveis ou inválidos (URL não http, tipo de estudo fora da lista, ano impossível) viram vazio — **nada é inventado**.
4. Os campos são preenchidos **apenas onde o formulário está vazio**; o usuário revisa e salva. Opcionalmente, as imagens são anexadas ao artigo como arquivos.
As imagens não são armazenadas pela leitura em si; só ficam salvas se o usuário optar por anexá-las.

## Segurança
- Recuperação executada com o cliente do usuário (RLS) e filtro explícito por workspaces do usuário **antes** do ranqueamento.
- Conteúdo dos documentos é escapado (não consegue fechar `<fonte>`) e o prompt de sistema determina que fontes são dados, nunca instruções.
- Conversas privadas do autor; IA pode ser desligada por workspace (`workspace_settings.ai_enabled`).

## Funcionalidades
- Página `/assistente`: histórico, nova conversa, pesquisa de conversas, assunto, contexto por módulo, sugestões de perguntas, indicador de processamento, cancelamento, copiar resposta, fontes citadas com links, exclusão de conversa.
- "Estudar com IA" nos detalhes de anotações, disciplinas, patologias, testes, estruturas e artigos: gera flashcards, questões, resumos, roteiros e fichamentos — exibidos para revisão e salvos apenas os aprovados (conteúdo salvo recebe nota de geração por IA e data).
- "Sugerir com IA" em Conteúdos relacionados: sugere relações entre registros existentes do workspace, com justificativa; cada uma exige aprovação.

## Alterar o modelo de embeddings
A coluna é `vector(1536)`. Para outra dimensão: nova migration alterando a coluna/índice e a assinatura de `match_document_chunks`, ajuste `embeddingDimensions` e reprocesse os documentos.
