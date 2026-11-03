import "server-only";
import { getAiConfig } from "./config";
import { createAnthropicProvider } from "./providers/anthropic";
import { createOpenAiProvider, openAiEmbeddings } from "./providers/openai";
import { AiError, type ChatProvider } from "./providers/types";

export { AiError } from "./providers/types";
export type { ChatTurn } from "./providers/types";

/** Provedor de chat configurado, ou erro explícito (nunca simula respostas). */
export function getChatProvider(): ChatProvider {
  const c = getAiConfig();
  if (!c.chatConfigured) {
    throw new AiError(
      "A integração de IA não está configurada. Defina AI_CHAT_PROVIDER, AI_CHAT_MODEL e a chave do provedor nas variáveis de ambiente do servidor.",
      "not_configured",
    );
  }
  if (c.chatProvider === "anthropic") return createAnthropicProvider(c.anthropicKey, c.chatModel, c.effort);
  return createOpenAiProvider(c.openaiKey, c.chatModel);
}

export function embeddingsAvailable(): boolean {
  return getAiConfig().embeddingsConfigured;
}

export async function embedTexts(texts: string[], signal?: AbortSignal): Promise<{ vectors: number[][]; tokens: number; model: string }> {
  const c = getAiConfig();
  if (!c.embeddingsConfigured) throw new AiError("Embeddings não configurados.", "not_configured");
  const vectors: number[][] = [];
  let tokens = 0;
  for (let i = 0; i < texts.length; i += 64) {
    const batch = texts.slice(i, i + 64).map((t) => t.slice(0, 8000));
    const res = await openAiEmbeddings(c.openaiKey, c.embeddingModel, batch, signal);
    vectors.push(...res.vectors);
    tokens += res.tokens;
  }
  return { vectors, tokens, model: c.embeddingModel };
}

/** Formato literal aceito pelo pgvector via PostgREST. */
export function toPgVector(v: number[]): string {
  return `[${v.map((x) => (Number.isFinite(x) ? x.toFixed(7) : "0")).join(",")}]`;
}
