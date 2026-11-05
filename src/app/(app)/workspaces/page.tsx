import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { requireSession } from "@/lib/session";
import { ROLE_LABELS, WORKSPACE_TYPES } from "@/lib/permissions";
import { CreateWorkspaceDialog } from "@/modules/workspaces/components";

export const metadata: Metadata = { title: "Workspaces" };

export default async function WorkspacesPage({ searchParams }: { searchParams: Promise<{ novo?: string }> }) {
  const ctx = await requireSession();
  const sp = await searchParams;
  return (
    <div className="space-y-5">
      <PageHeader title="Workspaces" description="Seu espaço pessoal é privado. Crie workspaces compartilhados para grupos de estudo, a liga acadêmica ou projetos científicos." icon="Users" actions={<CreateWorkspaceDialog defaultOpen={sp.novo === "1"} />} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ctx.workspaces.map((w) => (
          <Link key={w.id} href={`/workspaces/${w.id}`}>
            <Card className={w.id === ctx.workspace.id ? "border-primary" : "hover:border-primary/40"}>
              <CardContent className="space-y-2 pt-5">
                <div className="flex items-center justify-between gap-2"><p className="truncate font-medium">{w.name}</p>{w.id === ctx.workspace.id && <Badge tone="primary">Atual</Badge>}</div>
                <p className="line-clamp-2 text-sm text-muted-foreground">{w.description || (w.is_personal ? "Privado: somente você tem acesso." : "Sem descrição.")}</p>
                <div className="flex gap-1.5"><Badge>{WORKSPACE_TYPES[w.workspace_type]}</Badge><Badge tone="info">{ROLE_LABELS[w.role]}</Badge></div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
      <p className="text-sm"><Link href="/convites" className="text-primary hover:underline">Ver convites recebidos</Link></p>
    </div>
  );
}
