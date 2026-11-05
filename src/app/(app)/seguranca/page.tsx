import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/utils/format";
import { DeleteAccount, PasswordForm, SessionActions } from "@/modules/account/forms";

export const metadata: Metadata = { title: "Segurança e privacidade" };

export default async function SecurityPage() {
  const ctx = await requireSession();
  const supabase = await createClient();
  const { data: logs } = await supabase.from("workspace_audit_logs").select("action, workspace_name, created_at").eq("actor_id", ctx.user.id).order("created_at", { ascending: false }).limit(20);
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Segurança e privacidade" description="Controle sua senha, sessões e dados pessoais (LGPD)." icon="ShieldCheck" />
      <Card><CardHeader><CardTitle>Senha</CardTitle></CardHeader><CardContent><PasswordForm /></CardContent></Card>
      <Card>
        <CardHeader><div><CardTitle>Seus dados</CardTitle><CardDescription>Portabilidade: baixe todos os registros que você criou, em JSON. A exportação é registrada na auditoria.</CardDescription></div></CardHeader>
        <CardContent><SessionActions /></CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Como seus dados são protegidos</CardTitle></CardHeader>
        <CardContent className="prose-content text-sm">
          <ul>
            <li>Workspace pessoal privado por padrão; compartilhamento somente em workspaces para os quais você convida pessoas.</li>
            <li>Isolamento por usuário e workspace com Row Level Security no PostgreSQL, inclusive na busca e na IA.</li>
            <li>Arquivos em armazenamento privado, com links temporários e validação de tipo e tamanho.</li>
            <li>Casos clínicos devem ser anonimizados; a plataforma não é prontuário clínico certificado.</li>
            <li>Operações sensíveis registradas em auditoria. <Link href="/privacidade">Política de privacidade</Link>.</li>
          </ul>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Atividade recente</CardTitle></CardHeader>
        <CardContent>
          <ul className="divide-y divide-border text-sm">
            {((logs ?? []) as { action: string; workspace_name: string | null; created_at: string }[]).map((l, i) => (
              <li key={i} className="flex justify-between gap-2 py-1.5"><span>{l.action}{l.workspace_name ? ` · ${l.workspace_name}` : ""}</span><span className="text-xs text-muted-foreground">{formatDateTime(l.created_at)}</span></li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <Card className="border-danger/40"><CardHeader><div><CardTitle className="text-danger">Excluir conta</CardTitle><CardDescription>Ação permanente.</CardDescription></div></CardHeader><CardContent><DeleteAccount email={ctx.user.email} /></CardContent></Card>
    </div>
  );
}
