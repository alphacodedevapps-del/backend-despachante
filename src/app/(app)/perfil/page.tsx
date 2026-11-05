import type { Metadata } from "next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { AvatarForm, ProfileForm } from "@/modules/account/forms";

export const metadata: Metadata = { title: "Perfil" };

export default async function ProfilePage() {
  const ctx = await requireSession();
  const supabase = await createClient();
  const avatar = ctx.profile?.avatar_path ? (await supabase.storage.from("avatars").createSignedUrl(ctx.profile.avatar_path, 3600)).data?.signedUrl ?? null : null;
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Perfil" description={ctx.user.email} icon="User" />
      <Card><CardHeader><CardTitle>Foto de perfil</CardTitle></CardHeader><CardContent><AvatarForm url={avatar} /></CardContent></Card>
      <Card><CardHeader><CardTitle>Dados pessoais</CardTitle></CardHeader><CardContent><ProfileForm initial={(ctx.profile ?? {}) as unknown as Record<string, string | null>} /></CardContent></Card>
      <p className="text-xs text-muted-foreground">Coletamos apenas o necessário. Seu e-mail não é exibido a outros membros dos workspaces.</p>
    </div>
  );
}
