import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/shared/page-header";
import { requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { ROLE_LABELS, isAdmin, type WorkspaceRole } from "@/lib/permissions";
import { formatDateTime } from "@/lib/utils/format";
import { DeleteWorkspace, InviteDialog, MemberRow, RevokeInvitationButton, WorkspaceGeneralForm, WorkspaceSettingsForm } from "@/modules/workspaces/components";

export const metadata: Metadata = { title: "Gerenciar workspace" };

const ACTIONS: Record<string, string> = {
  "workspace.created": "Workspace criado", "workspace.updated": "Workspace atualizado", "workspace.ownership_transferred": "Propriedade transferida",
  "member.added": "Membro adicionado", "member.removed": "Membro removido", "member.role_changed": "Papel alterado",
  "invitation.created": "Convite criado", "invitation.accepted": "Convite aceito", "invitation.revoked": "Convite revogado",
  "document.deleted": "Arquivo excluído", "data.exported": "Dados exportados",
};

export default async function WorkspaceDetail({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireSession();
  const { id } = await params;
  const ws = ctx.workspaces.find((w) => w.id === id);
  if (!ws) notFound();
  const supabase = await createClient();
  const admin = isAdmin(ws.role);
  const [{ data: members }, { data: settings }, invites, audit] = await Promise.all([
    supabase.from("workspace_members").select("id, user_id, role, profiles(full_name)").eq("workspace_id", id).order("created_at"),
    supabase.from("workspace_settings").select("*").eq("workspace_id", id).maybeSingle(),
    admin ? supabase.from("workspace_invitations").select("id, email, role, expires_at, accepted_at, revoked_at, created_at").eq("workspace_id", id).order("created_at", { ascending: false }).limit(50) : Promise.resolve({ data: [] }),
    admin ? supabase.from("workspace_audit_logs").select("id, action, actor_id, details, created_at").eq("workspace_id", id).order("created_at", { ascending: false }).limit(50) : Promise.resolve({ data: [] }),
  ]);
  type M = { id: string; user_id: string; role: WorkspaceRole; profiles: { full_name: string | null } | { full_name: string | null }[] | null };
  const list = ((members ?? []) as unknown as M[]).map((m) => ({ id: m.id, user_id: m.user_id, role: m.role, name: (Array.isArray(m.profiles) ? m.profiles[0]?.full_name : m.profiles?.full_name) || "Usuário" }));
  const names = new Map(list.map((m) => [m.user_id, m.name]));
  const s = (settings ?? { allow_member_invites: false, default_invite_role: "member", invite_expiration_days: 7, ai_enabled: true }) as { allow_member_invites: boolean; default_invite_role: string; invite_expiration_days: number; ai_enabled: boolean };
  const canInvite = !ws.is_personal && (admin || ((ws.role === "editor" || ws.role === "member") && s.allow_member_invites));
  const now = new Date().toISOString();

  return (
    <div className="space-y-6">
      <PageHeader title={ws.name} description={`Seu papel: ${ROLE_LABELS[ws.role]}`} icon="Users" breadcrumbs={[{ label: "Workspaces", href: "/workspaces" }, { label: ws.name }]} />
      {ws.is_personal && <Alert tone="info" title="Workspace pessoal">Privado por padrão: não aceita convites. Para compartilhar conteúdos, crie um workspace compartilhado.</Alert>}
      <Card><CardHeader><CardTitle>Informações</CardTitle></CardHeader><CardContent><WorkspaceGeneralForm ws={{ id, name: ws.name, description: ws.description, workspace_type: ws.workspace_type, is_personal: ws.is_personal }} editable={admin} /></CardContent></Card>
      {!ws.is_personal && (
        <Card><CardHeader><div><CardTitle>Preferências do workspace</CardTitle><CardDescription>Convites e uso de IA.</CardDescription></div></CardHeader><CardContent><WorkspaceSettingsForm id={id} settings={s} editable={admin} /></CardContent></Card>
      )}
      <Card>
        <CardHeader><div><CardTitle>Membros ({list.length})</CardTitle><CardDescription>Proprietário, Administrador, Editor, Membro e Leitor.</CardDescription></div>{canInvite && <InviteDialog workspaceId={id} actorRole={ws.role} defaultRole={s.default_invite_role} />}</CardHeader>
        <CardContent><ul className="divide-y divide-border">{list.map((m) => <MemberRow key={m.id} member={m} actorRole={ws.role} workspaceId={id} isSelf={m.user_id === ctx.user.id} isPersonal={ws.is_personal} />)}</ul></CardContent>
      </Card>
      {admin && !ws.is_personal && (
        <Card>
          <CardHeader><CardTitle>Convites</CardTitle></CardHeader>
          <CardContent>
            {((invites.data ?? []) as { id: string; email: string; role: WorkspaceRole; expires_at: string; accepted_at: string | null; revoked_at: string | null }[]).length === 0 ? <p className="text-sm text-muted-foreground">Nenhum convite enviado.</p> : (
              <ul className="divide-y divide-border">
                {((invites.data ?? []) as { id: string; email: string; role: WorkspaceRole; expires_at: string; accepted_at: string | null; revoked_at: string | null }[]).map((i) => {
                  const status = i.accepted_at ? "Aceito" : i.revoked_at ? "Revogado" : i.expires_at < now ? "Expirado" : "Pendente";
                  return (
                    <li key={i.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                      <span className="min-w-0 truncate">{i.email} · {ROLE_LABELS[i.role]} <span className="text-xs text-muted-foreground">expira {formatDateTime(i.expires_at)}</span></span>
                      <span className="flex items-center gap-2"><Badge tone={status === "Pendente" ? "warning" : status === "Aceito" ? "success" : "neutral"}>{status}</Badge>{status === "Pendente" && <RevokeInvitationButton id={i.id} workspaceId={id} />}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
      {admin && (
        <Card>
          <CardHeader><div><CardTitle>Auditoria</CardTitle><CardDescription>Operações sensíveis registradas no banco de dados.</CardDescription></div></CardHeader>
          <CardContent>
            <ul className="divide-y divide-border text-sm">
              {((audit.data ?? []) as { id: string; action: string; actor_id: string | null; details: Record<string, unknown>; created_at: string }[]).map((a) => (
                <li key={a.id} className="flex flex-col py-1.5 sm:flex-row sm:justify-between">
                  <span>{ACTIONS[a.action] ?? a.action}{a.details && Object.keys(a.details).length ? <span className="text-xs text-muted-foreground"> — {Object.entries(a.details).map(([k, v]) => `${k}: ${String(v)}`).join(", ")}</span> : null}</span>
                  <span className="text-xs text-muted-foreground">{a.actor_id ? names.get(a.actor_id) ?? "Ex-membro" : "Sistema"} · {formatDateTime(a.created_at)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
      {ws.role === "owner" && !ws.is_personal && (
        <Card className="border-danger/40"><CardHeader><div><CardTitle className="text-danger">Zona de perigo</CardTitle><CardDescription>A exclusão é permanente e exige confirmação.</CardDescription></div></CardHeader><CardContent><DeleteWorkspace id={id} name={ws.name} /></CardContent></Card>
      )}
    </div>
  );
}
