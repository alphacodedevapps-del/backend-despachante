import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { requireSession } from "@/lib/session";
import { resolveSrsSettings } from "@/lib/domain/srs";
import { PreferencesForm } from "@/modules/account/forms";

export const metadata: Metadata = { title: "Configurações" };

export default async function SettingsPage() {
  const ctx = await requireSession();
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
          }} />
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
