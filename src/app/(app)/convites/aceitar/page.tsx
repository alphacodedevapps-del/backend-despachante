import type { Metadata } from "next";
import { Card, CardContent } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/shared/page-header";
import { requireSession } from "@/lib/session";
import { AcceptInvitation } from "@/modules/workspaces/components";

export const metadata: Metadata = { title: "Aceitar convite" };

export default async function AcceptPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const ctx = await requireSession();
  const { token } = await searchParams;
  const valid = typeof token === "string" && /^[0-9a-f]{64}$/i.test(token);
  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title="Convite para workspace" icon="Mail" />
      <Card><CardContent className="space-y-4 pt-5">
        {valid ? (
          <>
            <p className="text-sm">Você está conectado como <strong>{ctx.user.email}</strong>. O convite só pode ser aceito pelo e-mail para o qual foi enviado.</p>
            <AcceptInvitation token={token} />
          </>
        ) : <Alert tone="danger">Link de convite inválido.</Alert>}
      </CardContent></Card>
    </div>
  );
}
