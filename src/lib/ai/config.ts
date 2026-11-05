import "server-only";

/** Configuração da camada de IA — lida apenas no servidor. */
export type ChatProviderName = "anthropic" | "openai" | "google";

function num(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

export function getAiConfig() {
  const chatProvider = (process.env.AI_CHAT_PROVIDER ?? "anthropic").toLowerCase() as ChatProviderName;
  const embeddingProvider = (process.env.AI_EMBEDDING_PROVIDER ?? "openai").toLowerCase();
  const embeddingKey = embeddingProvider === "google" ? process.env.GEMINI_API_KEY ?? "" : process.env.OPENAI_API_KEY ?? "";
  const anthropicKey = process.env.ANTHROPIC_API_KEY ?? "";
  const openaiKey = process.env.OPENAI_API_KEY ?? "";
  const googleKey = process.env.GEMINI_API_KEY ?? "";
  const chatKey = chatProvider === "anthropic" ? anthropicKey : chatProvider === "openai" ? openaiKey : chatProvider === "google" ? googleKey : "";
  const defaultModel = chatProvider === "anthropic" ? "claude-opus-5-5" : chatProvider === "google" ? "gemini-2.5-flash" : "";
  return {
    chatProvider,
    chatModel: process.env.AI_CHAT_MODEL || defaultModel,
    chatConfigured: Boolean(chatKey) && (chatProvider === "anthropic" || chatProvider === "openai" || chatProvider === "google") && Boolean(process.env.AI_CHAT_MODEL || defaultModel),
    effort: (process.env.AI_EFFORT ?? "medium") as "low" | "medium" | "high" | "xhigh" | "max" | "none",
    embeddingProvider,
    embeddingModel: process.env.AI_EMBEDDING_MODEL || (embeddingProvider === "google" ? "gemini-embedding-001" : "text-embedding-3-small"),
    embeddingDimensions: 1536,
    embeddingsConfigured: (embeddingProvider === "openai" || embeddingProvider === "google") && Boolean(embeddingKey),
    embeddingKey,
    anthropicKey,
    openaiKey,
    maxOutputTokens: Math.min(num("AI_MAX_OUTPUT_TOKENS", 4096), 16000),
    dailyRequestLimit: num("AI_DAILY_REQUEST_LIMIT", 100),
    monthlyTokenLimit: num("AI_MONTHLY_TOKEN_LIMIT", 2_000_000),
    costInputPerMTok: num("AI_COST_INPUT_PER_MTOK", 4),
    costOutputPerMTok: num("AI_COST_OUTPUT_PER_MTOK", 20),
    costEmbeddingPerMTok: num("AI_COST_EMBEDDING_PER_MTOK", 0.02),
  };
}

export type AiConfig = ReturnType<typeof getAiConfig>;

/** Informações seguras para exibir na interface (sem chaves). */
export function publicAiStatus() {
  const c = getAiConfig();
  return {
    chatConfigured: c.chatConfigured,
    embeddingsConfigured: c.embeddingsConfigured,
    chatProvider: c.chatProvider,
    chatModel: c.chatConfigured ? c.chatModel : null,
    embeddingModel: c.embeddingsConfigured ? c.embeddingModel : null,
    dailyRequestLimit: c.dailyRequestLimit,
    monthlyTokenLimit: c.monthlyTokenLimit,
  };
}
