"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, Loader2, Plus, Trash2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox, Input, Label, NativeSelect, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { ROLE_DESCRIPTIONS, ROLE_LABELS, WORKSPACE_TYPES, assignableRoles, canManageMember, type WorkspaceRole } from "@/lib/permissions";
import {
  acceptInvitationAction,
  acceptInvitationByIdAction,
  changeMemberRoleAction,
  createWorkspaceAction,
  deleteWorkspaceAction,
  inviteMemberAction,
  removeMemberAction,
  revokeInvitationAction,
  transferOwnershipAction,
  updateWorkspaceAction,
  updateWorkspaceSettingsAction,
} from "./actions";

const TYPE_OPTIONS = Object.entries(WORKSPACE_TYPES).filter(([k]) => k !== "pessoal");

export function CreateWorkspaceDialog({ defaultOpen }: { defaultOpen?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(Boolean(defaultOpen));
  const [v, setV] = React.useState({ name: "", description: "", workspace_type: "grupo_estudos" });
  const [busy, setBusy] = React.useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><Plus /> Criar workspace</Button></DialogTrigger>
      <DialogContent title="Novo workspace" description="Espaço compartilhado para grupo de estudos, liga acadêmica ou projeto científico. Seu workspace pessoal continua privado.">
        <form className="space-y-3" onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const res = await createWorkspaceAction({ ...v, workspace_type: v.workspace_type as "grupo_estudos" });
          setBusy(false);
          if (!res.ok) return void toast.error(res.error);
          toast.success("Workspace criado e selecionado.");
          setOpen(false);
          router.push(`/workspaces/${res.data.id}`);
          router.refresh();
        }}>
          <div className="space-y-1.5"><Label htmlFor="ws-name">Nome</Label><Input id="ws-name" value={v.name} maxLength={120} onChange={(e) => setV({ ...v, name: e.target.value })} required /></div>
          <div className="space-y-1.5"><Label htmlFor="ws-type">Tipo</Label><NativeSelect id="ws-type" value={v.workspace_type} onChange={(e) => setV({ ...v, workspace_type: e.target.value })}>{TYPE_OPTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</NativeSelect></div>
          <div className="space-y-1.5"><Label htmlFor="ws-desc">Descrição</Label><Textarea id="ws-desc" value={v.description} maxLength={1000} onChange={(e) => setV({ ...v, description: e.target.value })} /></div>
          <div className="flex justify-end gap-2"><DialogClose asChild><Button variant="outline">Cancelar</Button></DialogClose><Button type="submit" disabled={busy}>{busy && <Loader2 className="animate-spin" />} Criar</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function WorkspaceGeneralForm({ ws, editable }: { ws: { id: string; name: string; description: string | null; workspace_type: string; is_personal: boolean }; editable: boolean }) {
  const router = useRouter();
  const [v, setV] = React.useState({ name: ws.name, description: ws.description ?? "", workspace_type: ws.workspace_type });
  const [busy, setBusy] = React.useState(false);
  return (
    <form className="grid gap-3 sm:grid-cols-2" onSubmit={async (e) => {
      e.preventDefault();
      setBusy(true);
      const res = await updateWorkspaceAction(ws.id, { name: v.name, description: v.description, workspace_type: ws.is_personal ? undefined : v.workspace_type });
      setBusy(false);
      if (!res.ok) return void toast.error(res.error);
      toast.success("Workspace atualizado.");
      router.refresh();
    }}>
      <div className="space-y-1.5"><Label htmlFor="wg-name">Nome</Label><Input id="wg-name" value={v.name} disabled={!editable} onChange={(e) => setV({ ...v, name: e.target.value })} /></div>
      <div className="space-y-1.5"><Label htmlFor="wg-type">Tipo</Label>
        {ws.is_personal ? <Input id="wg-type" value="Pessoal (privado)" disabled /> : <NativeSelect id="wg-type" value={v.workspace_type} disabled={!editable} onChange={(e) => setV({ ...v, workspace_type: e.target.value })}>{TYPE_OPTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</NativeSelect>}
      </div>
      <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="wg-desc">Descrição</Label><Textarea id="wg-desc" value={v.description} disabled={!editable} onChange={(e) => setV({ ...v, description: e.target.value })} /></div>
      {editable && <div className="sm:col-span-2"><Button type="submit" disabled={busy}>{busy && <Loader2 className="animate-spin" />} Salvar</Button></div>}
    </form>
  );
}

export function WorkspaceSettingsForm({ id, settings, editable }: { id: string; settings: { allow_member_invites: boolean; default_invite_role: string; invite_expiration_days: number; ai_enabled: boolean }; editable: boolean }) {
  const router = useRouter();
  const [v, setV] = React.useState(settings);
  const [busy, setBusy] = React.useState(false);
  return (
    <form className="space-y-3" onSubmit={async (e) => {
      e.preventDefault();
      setBusy(true);
      const res = await updateWorkspaceSettingsAction(id, v);
      setBusy(false);
      if (!res.ok) return void toast.error(res.error);
      toast.success("Preferências do workspace salvas.");
      router.refresh();
    }}>
      <label className="flex items-center gap-2 text-sm"><Checkbox checked={v.allow_member_invites} disabled={!editable} onChange={(e) => setV({ ...v, allow_member_invites: e.target.checked })} /> Editores e membros podem convidar pessoas</label>
      <label className="flex items-center gap-2 text-sm"><Checkbox checked={v.ai_enabled} disabled={!editable} onChange={(e) => setV({ ...v, ai_enabled: e.target.checked })} /> Permitir o Assistente acadêmico (IA) neste workspace</label>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5"><Label htmlFor="wsd-role">Papel padrão dos convites</Label><NativeSelect id="wsd-role" disabled={!editable} value={v.default_invite_role} onChange={(e) => setV({ ...v, default_invite_role: e.target.value })}>{(["editor", "member", "viewer", "admin"] as WorkspaceRole[]).map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</NativeSelect></div>
        <div className="space-y-1.5"><Label htmlFor="wsd-exp">Validade dos convites (dias)</Label><Input id="wsd-exp" type="number" min={1} max={30} disabled={!editable} value={v.invite_expiration_days} onChange={(e) => setV({ ...v, invite_expiration_days: Math.max(1, Math.min(30, Number(e.target.value) || 7)) })} /></div>
      </div>
      {editable && <Button type="submit" disabled={busy}>{busy && <Loader2 className="animate-spin" />} Salvar preferências</Button>}
    </form>
  );
}

export function InviteDialog({ workspaceId, actorRole, defaultRole }: { workspaceId: string; actorRole: WorkspaceRole; defaultRole: string }) {
  const router = useRouter();
  const roles = actorRole === "owner" ? (["admin", "editor", "member", "viewer"] as WorkspaceRole[]) : (["editor", "member", "viewer"] as WorkspaceRole[]);
  const [open, setOpen] = React.useState(false);
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState(roles.includes(defaultRole as WorkspaceRole) ? defaultRole : "member");
  const [link, setLink] = React.useState<{ link: string; expiresAt: string } | null>(null);
  const [busy, setBusy] = React.useState(false);
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setLink(null); setEmail(""); } }}>
      <DialogTrigger asChild><Button><UserPlus /> Convidar</Button></DialogTrigger>
      <DialogContent title="Convidar membro" description="O convite é vinculado ao e-mail informado, expira automaticamente e só pode ser usado uma vez.">
        {link ? (
          <div className="space-y-3">
            <Alert tone="success" title="Convite criado">Envie este link à pessoa convidada. Por segurança, ele é exibido apenas agora. Se ela já tiver conta, também receberá uma notificação interna.</Alert>
            <div className="flex gap-2"><Input readOnly value={link.link} aria-label="Link do convite" onFocus={(e) => e.target.select()} /><Button variant="outline" onClick={async () => { await navigator.clipboard.writeText(link.link); toast.success("Link copiado."); }}><Copy /></Button></div>
            <p className="text-xs text-muted-foreground">Expira em {new Date(link.expiresAt).toLocaleString("pt-BR")}.</p>
          </div>
        ) : (
          <form className="space-y-3" onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const res = await inviteMemberAction(workspaceId, email, role);
            setBusy(false);
            if (!res.ok) return void toast.error(res.error);
            setLink(res.data);
            router.refresh();
          }}>
            <div className="space-y-1.5"><Label htmlFor="inv-email">E-mail</Label><Input id="inv-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="inv-role">Papel</Label><NativeSelect id="inv-role" value={role} onChange={(e) => setRole(e.target.value)}>{roles.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]} — {ROLE_DESCRIPTIONS[r]}</option>)}</NativeSelect></div>
            <div className="flex justify-end"><Button type="submit" disabled={busy}>{busy && <Loader2 className="animate-spin" />} Gerar convite</Button></div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function MemberRow({ member, actorRole, workspaceId, isSelf, isPersonal }: {
  member: { id: string; user_id: string; role: WorkspaceRole; name: string };
  actorRole: WorkspaceRole;
  workspaceId: string;
  isSelf: boolean;
  isPersonal: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const manage = !isSelf && canManageMember(actorRole, member.role);
  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>, msg: string) => {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (!res.ok) toast.error(res.error ?? "Erro.");
    else { toast.success(msg); router.refresh(); }
  };
  return (
    <li className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:justify-between">
      <div><p className="text-sm font-medium">{member.name}{isSelf && <span className="text-muted-foreground"> (você)</span>}</p><p className="text-xs text-muted-foreground">{ROLE_DESCRIPTIONS[member.role]}</p></div>
      <div className="flex items-center gap-2">
        {manage ? (
          <NativeSelect aria-label={`Papel de ${member.name}`} value={member.role} disabled={busy} className="h-8 w-40 text-xs" onChange={(e) => run(() => changeMemberRoleAction(member.id, workspaceId, e.target.value), "Papel atualizado.")}>
            {assignableRoles(actorRole).map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </NativeSelect>
        ) : <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs font-medium">{ROLE_LABELS[member.role]}</span>}
        {actorRole === "owner" && !isSelf && !isPersonal && (
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => { if (confirm(`Transferir a propriedade para ${member.name}? Você passará a ser administrador.`)) void run(() => transferOwnershipAction(workspaceId, member.user_id), "Propriedade transferida."); }}>Tornar proprietário</Button>
        )}
        {(manage || (isSelf && member.role !== "owner")) && (
          <Button variant="danger-ghost" size="icon-sm" disabled={busy} aria-label={isSelf ? "Sair do workspace" : `Remover ${member.name}`} onClick={() => { if (confirm(isSelf ? "Sair deste workspace?" : `Remover ${member.name} do workspace?`)) void run(() => removeMemberAction(member.id, workspaceId), isSelf ? "Você saiu do workspace." : "Membro removido."); }}>
            {busy ? <Loader2 className="animate-spin" /> : <Trash2 />}
          </Button>
        )}
      </div>
    </li>
  );
}

export function RevokeInvitationButton({ id, workspaceId }: { id: string; workspaceId: string }) {
  const router = useRouter();
  return <Button variant="ghost" size="sm" onClick={async () => { const r = await revokeInvitationAction(id, workspaceId); if (!r.ok) toast.error(r.error); else { toast.success("Convite revogado."); router.refresh(); } }}>Revogar</Button>;
}

export function DeleteWorkspace({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [confirmName, setConfirmName] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  return (
    <Dialog>
      <DialogTrigger asChild><Button variant="danger"><Trash2 /> Excluir workspace</Button></DialogTrigger>
      <DialogContent title="Excluir workspace" description="Todo o conteúdo, arquivos, membros e convites deste workspace serão excluídos permanentemente.">
        <div className="space-y-3">
          <Label htmlFor="del-ws">Digite <strong>{name}</strong> para confirmar</Label>
          <Input id="del-ws" value={confirmName} onChange={(e) => setConfirmName(e.target.value)} />
          <div className="flex justify-end gap-2">
            <DialogClose asChild><Button variant="outline">Cancelar</Button></DialogClose>
            <Button variant="danger" disabled={busy || confirmName.trim() !== name} onClick={async () => {
              setBusy(true);
              const res = await deleteWorkspaceAction(id, confirmName);
              setBusy(false);
              if (!res.ok) return void toast.error(res.error);
              toast.success("Workspace excluído.");
              router.push("/workspaces");
              router.refresh();
            }}>{busy && <Loader2 className="animate-spin" />} Excluir definitivamente</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function AcceptInvitation({ token, id }: { token?: string; id?: string }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  return (
    <div className="space-y-3">
      {error && <Alert tone="danger">{error}</Alert>}
      <Button disabled={busy} onClick={async () => {
        setBusy(true);
        const res = token ? await acceptInvitationAction(token) : await acceptInvitationByIdAction(id!);
        setBusy(false);
        if (!res.ok) return setError(res.error);
        toast.success("Convite aceito! Bem-vindo(a) ao workspace.");
        router.push("/dashboard");
        router.refresh();
      }}>{busy && <Loader2 className="animate-spin" />} Aceitar convite</Button>
    </div>
  );
}
