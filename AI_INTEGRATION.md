# Inteligência artificial — status

**Removida por enquanto.** O assistente acadêmico, a busca por significado, as sugestões de relacionamento e o "Estudar com IA" foram retirados do sistema, a pedido do responsável pelo projeto.

## O que continua funcionando sem IA
- **Busca global** e **busca por palavras** dentro dos documentos enviados (texto extraído no servidor).
- **Leitura de PDF de artigo:** extrai título, DOI, ano, revista, URL, palavras-chave e resumo por regras (`src/lib/domain/article-parse.ts`).
- **Leitura de fotos do artigo:** o reconhecimento de texto (OCR, `tesseract.js`) roda no próprio navegador, sem enviar as imagens a nenhum provedor. O mesmo leitor por regras preenche o formulário.
- Autores, método, resultados e conclusão continuam sendo preenchidos à mão: a leitura automática não é confiável para esses campos.

## Como reativar no futuro
O histórico do projeto guarda a integração anterior (Anthropic, OpenAI e Google Gemini via endpoint compatível). Para reativar, restaure os arquivos de `src/lib/ai/`, `src/modules/assistant/` e `src/app/api/assistant/` a partir do commit anterior à remoção, e ligue as variáveis `AI_CHAT_PROVIDER`, `AI_CHAT_MODEL`, `GEMINI_API_KEY` (ou `ANTHROPIC_API_KEY` / `OPENAI_API_KEY`) no ambiente.
