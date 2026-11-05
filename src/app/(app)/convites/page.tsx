import type { Metadata } from "next";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { ROLE_LABELS, type WorkspaceRole } from "@/lib/permissions";
import { formatDateTime } from "@/lib/utils/format";
import { AcceptInvitation } from "@/modules/workspaces/components";

export const metadata: Metadata = { title: "Convites" };

export default async function InvitesPage() {
  await requireSession();
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_pending_invitations");
  const list = (data ?? []) as { id: string; workspace_name: string; role: WorkspaceRole; expires_at: string }[];
  return (
    <div className="space-y-4">
      <PageHeader title="Convites recebidos" description="Convites pendentes enviados para o seu e-mail." icon="Mail" />
      {list.length === 0 ? <EmptyState icon="Mail" title="Nenhum convite pendente" /> : list.map((i) => (
        <Card key={i.id}><CardContent className="flex flex-col gap-3 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <div><p className="font-medium">{i.workspace_name}</p><p className="text-sm text-muted-foreground">Papel: {ROLE_LABELS[i.role]} · expira em {formatDateTime(i.expires_at)}</p></div>
          <AcceptInvitation id={i.id} />
        </CardContent></Card>
      ))}
    </div>
  );
}
