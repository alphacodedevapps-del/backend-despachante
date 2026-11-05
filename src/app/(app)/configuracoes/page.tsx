import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/shared/page-header";
import { requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { publicAiStatus } from "@/lib/ai/config";
import { resolveSrsSettings } from "@/lib/domain/srs";
import { formatNumber } from "@/lib/utils/format";
import { PreferencesForm } from "@/modules/account/forms";

export const metadata: Metadata = { title: "Configurações" };

export default async function SettingsPage() {
  const ctx = await requireSession();
  const ai = publicAiStatus();
  const supabase = await createClient();
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
  const { data: usage } = await supabase.from("ai_usage_logs").select("tokens_in, tokens_out, estimated_cost_usd, operation").eq("user_id", ctx.user.id).gte("created_at", monthStart).limit(10000);
  const u = (usage ?? []) as { tokens_in: number; tokens_out: number; estimated_cost_usd: number; operation: string }[];
  const tokens = u.reduce((s, r) => s + r.tokens_in + r.tokens_out, 0);
  const cost = u.reduce((s, r) => s + Number(r.estimated_cost_usd), 0);
  const p = ctx.preferences;
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Configurações" description="Preferências salvas no seu perfil e sincronizadas entre dispositivos." icon="Settings" />
      <Card>
        <CardContent className="pt-5">
          <PreferencesForm initial={{
            theme: p?.theme ?? "system",
            notification_prefs: p?.notification_prefs ?? {},
            calendar_prefs: p?.calendar_prefs ?? { week_starts_on: 0, default_view: "month" },
            srs_settings: resolveSrsSettings(p?.srs_settings),
            ai_prefs: { answer_style: (p?.ai_prefs?.answer_style as "didatico") ?? "didatico", max_sources: p?.ai_prefs?.max_sources ?? 8 },
          }} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader><div><CardTitle>Configuração de IA</CardTitle><CardDescription>Definida pelo administrador do servidor via variáveis de ambiente. Chaves nunca são enviadas ao navegador.</CardDescription></div></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>Chat: {ai.chatConfigured ? <Badge tone="success">Configurado · {ai.chatProvider} · {ai.chatModel}</Badge> : <Badge tone="warning">Não configurado</Badge>}</p>
          <p>Busca semântica (embeddings): {ai.embeddingsConfigured ? <Badge tone="success">{ai.embeddingModel}</Badge> : <Badge>Somente busca textual</Badge>}</p>
          <p className="text-muted-foreground">Uso neste mês: {formatNumber(tokens)} tokens · custo estimado US$ {formatNumber(cost, 4)} · limites: {ai.dailyRequestLimit} solicitações/dia, {formatNumber(ai.monthlyTokenLimit)} tokens/mês.</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Mais configurações</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-3 text-sm">
          <Link href="/perfil" className="text-primary hover:underline">Dados pessoais e foto</Link>
          <Link href={`/workspaces/${ctx.workspace.id}`} className="text-primary hover:underline">Preferências do workspace atual</Link>
          <Link href="/arquivos" className="text-primary hover:underline">Gerenciamento de arquivos</Link>
          <Link href="/seguranca" className="text-primary hover:underline">Segurança, exportação e exclusão de conta</Link>
        </CardContent>
      </Card>
    </div>
  );
}
