import "server-only";
import { AiError, type ChatProvider, type ChatRequest, type ChatResult } from "./types";

export const OPENAI_BASE = "https://api.openai.com/v1";
export const GOOGLE_OPENAI_BASE = "https://generativelanguage.googleapis.com/v1beta/openai";

async function openaiFetch(path: string, apiKey: string, body: unknown, signal?: AbortSignal, base = OPENAI_BASE) {
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw new AiError("Solicitação cancelada.", "cancelled");
    throw new AiError("Não foi possível conectar ao provedor de IA.", "provider", true);
  }
  if (res.status === 401 || res.status === 403) throw new AiError("Credencial do provedor de IA inválida. Verifique a configuração do servidor.", "auth");
  if (res.status === 429) throw new AiError("Limite de requisições do provedor atingido. Tente novamente em instantes.", "rate_limited", true);
  if (res.status === 400) throw new AiError("A solicitação foi rejeitada pelo provedor de IA.", "bad_request");
  if (!res.ok) throw new AiError(`Erro do provedor de IA (${res.status}).`, "provider", true);
  return res.json();
}

/** Chat compatível com OpenAI (OpenAI e Google Gemini via endpoint compatível). */
export function createOpenAiProvider(apiKey: string, model: string, opts: { base?: string; name?: string } = {}): ChatProvider {
  const isGoogle = opts.base === GOOGLE_OPENAI_BASE;
  return {
    name: opts.name ?? "openai",
    model,
    async chat(req: ChatRequest): Promise<ChatResult> {
      const json = await openaiFetch(
        "/chat/completions",
        apiKey,
        {
          model,
          ...(isGoogle ? { max_tokens: req.maxTokens } : { max_completion_tokens: req.maxTokens }),
          messages: [
            { role: "system", content: req.system },
            ...req.messages.map((m) =>
              m.images?.length
                ? { role: m.role, content: [...m.images.map((img) => ({ type: "image_url", image_url: { url: `data:${img.mediaType};base64,${img.data}` } })), { type: "text", text: m.content }] }
                : { role: m.role, content: m.content },
            ),
          ],
        },
        req.signal,
        opts.base,
      );
      const choice = json.choices?.[0];
      return {
        text: String(choice?.message?.content ?? "").trim(),
        tokensIn: Number(json.usage?.prompt_tokens ?? 0),
        tokensOut: Number(json.usage?.completion_tokens ?? 0),
        model: String(json.model ?? model),
        provider: opts.name ?? "openai",
      };
    },
  };
}

/** Embeddings (OpenAI). Retorna vetores na mesma ordem dos textos. */
export async function openAiEmbeddings(apiKey: string, model: string, texts: string[], signal?: AbortSignal, base = OPENAI_BASE): Promise<{ vectors: number[][]; tokens: number }> {
  const json = await openaiFetch("/embeddings", apiKey, { model, input: texts, dimensions: 1536 }, signal, base);
  const data = (json.data ?? []) as { index: number; embedding: number[] }[];
  const vectors = data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
  if (vectors.length !== texts.length) throw new AiError("Resposta de embeddings incompleta.", "provider", true);
  return { vectors, tokens: Number(json.usage?.total_tokens ?? 0) };
}
