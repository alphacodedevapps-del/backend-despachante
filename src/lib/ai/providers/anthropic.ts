import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { AiError, type ChatProvider, type ChatRequest, type ChatResult } from "./types";

/** Modelos que aceitam o fallback de recusa no servidor (`fallbacks: "default"`). */
const FALLBACK_MODELS = new Set(["claude-fable-5-1", "claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5"]);

export function createAnthropicProvider(apiKey: string, model: string, effort: string): ChatProvider {
  const client = new Anthropic({ apiKey, maxRetries: 2, timeout: 120_000 });
  const useFallback = FALLBACK_MODELS.has(model);

  return {
    name: "anthropic",
    model,
    async chat(req: ChatRequest): Promise<ChatResult> {
      try {
        const response = await client.beta.messages.create(
          {
            model,
            max_tokens: req.maxTokens,
            system: req.system,
            messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
            ...(effort !== "none" ? { output_config: { effort: effort as "low" | "medium" | "high" | "xhigh" | "max" } } : {}),
            ...(useFallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
          },
          { signal: req.signal },
        );

        if (response.stop_reason === "refusal") {
          throw new AiError("O modelo recusou esta solicitação por políticas de segurança. Reformule a pergunta.", "refusal");
        }

        const text = response.content
          .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
          .map((b) => b.text)
          .join("\n")
          .trim();

        return {
          text: response.stop_reason === "max_tokens" ? `${text}\n\n_(Resposta interrompida pelo limite de tamanho.)_` : text,
          tokensIn: response.usage.input_tokens + (response.usage.cache_read_input_tokens ?? 0) + (response.usage.cache_creation_input_tokens ?? 0),
          tokensOut: response.usage.output_tokens,
          model: response.model,
          provider: "anthropic",
        };
      } catch (error) {
        if (error instanceof AiError) throw error;
        if (error instanceof Anthropic.APIUserAbortError) throw new AiError("Solicitação cancelada.", "cancelled");
        if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
          throw new AiError("Credencial do provedor de IA inválida. Verifique a configuração do servidor.", "auth");
        }
        if (error instanceof Anthropic.RateLimitError) throw new AiError("Limite de requisições do provedor atingido. Tente novamente em instantes.", "rate_limited", true);
        if (error instanceof Anthropic.BadRequestError) throw new AiError("A solicitação foi rejeitada pelo provedor de IA (conteúdo muito longo ou parâmetro inválido).", "bad_request");
        if (error instanceof Anthropic.APIConnectionError) throw new AiError("Não foi possível conectar ao provedor de IA.", "provider", true);
        if (error instanceof Anthropic.APIError) throw new AiError(`Erro do provedor de IA (${error.status ?? "?"}).`, "provider", true);
        throw new AiError("Falha inesperada ao consultar a IA.", "provider");
      }
    },
  };
}
