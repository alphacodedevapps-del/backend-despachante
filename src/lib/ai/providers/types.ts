export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  system: string;
  messages: ChatTurn[];
  maxTokens: number;
  signal?: AbortSignal;
}

export interface ChatResult {
  text: string;
  tokensIn: number;
  tokensOut: number;
  model: string;
  provider: string;
}

export interface ChatProvider {
  name: string;
  model: string;
  chat(req: ChatRequest): Promise<ChatResult>;
}

/** Erros normalizados da camada de IA (mensagens em português, sem detalhes sensíveis). */
export class AiError extends Error {
  constructor(
    message: string,
    public readonly kind: "not_configured" | "rate_limited" | "auth" | "refusal" | "cancelled" | "provider" | "limit" | "bad_request",
    public readonly retryable = false,
  ) {
    super(message);
    this.name = "AiError";
  }
}
