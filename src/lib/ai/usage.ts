import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAiConfig } from "./config";
import { AiError } from "./providers/types";

/** Verifica limites diários de requisições e mensais de tokens do usuário. */
export async function assertWithinLimits(supabase: SupabaseClient, userId: string) {
  const c = getAiConfig();
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const monthStart = new Date(dayStart.getFullYear(), dayStart.getMonth(), 1);

  const [{ count: today }, { data: month }] = await Promise.all([
    supabase.from("ai_usage_logs").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("operation", "chat").gte("created_at", dayStart.toISOString()),
    supabase.from("ai_usage_logs").select("tokens_in, tokens_out").eq("user_id", userId).gte("created_at", monthStart.toISOString()).limit(10000),
  ]);
  if ((today ?? 0) >= c.dailyRequestLimit) {
    throw new AiError(`Limite diário de ${c.dailyRequestLimit} solicitações à IA atingido. Tente novamente amanhã.`, "limit");
  }
  const used = ((month ?? []) as { tokens_in: number; tokens_out: number }[]).reduce((s, r) => s + r.tokens_in + r.tokens_out, 0);
  if (used >= c.monthlyTokenLimit) {
    throw new AiError("Limite mensal de uso da IA atingido.", "limit");
  }
}

export async function logUsage(
  supabase: SupabaseClient,
  entry: {
    userId: string;
    workspaceId: string | null;
    provider: string;
    model: string;
    operation: "chat" | "embedding" | "generation";
    status: "ok" | "erro" | "cancelado" | "limite";
    tokensIn?: number;
    tokensOut?: number;
    latencyMs?: number;
    error?: string;
  },
) {
  const c = getAiConfig();
  const tin = entry.tokensIn ?? 0;
  const tout = entry.tokensOut ?? 0;
  const cost =
    entry.operation === "embedding"
      ? (tin / 1_000_000) * c.costEmbeddingPerMTok
      : (tin / 1_000_000) * c.costInputPerMTok + (tout / 1_000_000) * c.costOutputPerMTok;
  await supabase.from("ai_usage_logs").insert({
    user_id: entry.userId,
    workspace_id: entry.workspaceId,
    provider: entry.provider,
    model: entry.model,
    operation: entry.operation,
    status: entry.status,
    tokens_in: tin,
    tokens_out: tout,
    estimated_cost_usd: Math.round(cost * 1e6) / 1e6,
    latency_ms: entry.latencyMs ?? null,
    error: entry.error?.slice(0, 2000) ?? null,
  });
}
