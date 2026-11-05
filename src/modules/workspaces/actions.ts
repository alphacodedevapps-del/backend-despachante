"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext, WORKSPACE_COOKIE } from "@/lib/session";
import { siteUrl } from "@/lib/supabase/env";
import { fail, friendlyDbError, type ActionResult } from "@/lib/errors";

const UUID = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const TYPES = ["grupo_estudos", "liga", "projeto", "institucional"] as const;
const wsSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome.").max(120),
  description: z.string().trim().max(1000).nullable(),
  workspace_type: z.enum(TYPES),
});

export async function createWorkspaceAction(input: z.input<typeof wsSchema>): Promise<ActionResult<{ id: string }>> {
  const parsed = wsSchema.safeParse({ ...input, description: input.description || null });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Dados inválidos.");
  const ctx = await getSessionContext();
  if (!ctx) return fail("Sessão expirada.");
  const supabase = await createClient();
  const { data, error } = await supabase.from("workspaces").insert({ ...parsed.data, owner_id: ctx.user.id, is_personal: false }).select("id").single();
  if (error || !data) return fail(friendlyDbError(error));
  const store = await cookies();
  store.set(WORKSPACE_COOKIE, data.id as string, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 31536000 });
  revalidatePath("/", "layout");
  return { ok: true, data: { id: data.id as string } };
}

export async function updateWorkspaceAction(id: string, input: { name: string; description: string | null; workspace_type?: string }): Promise<ActionResult> {
  if (!UUID.safeParse(id).success) return fail("Workspace inválido.");
  const parsed = z.object({ name: z.string().trim().min(1).max(120), description: z.string().trim().max(1000).nullable() }).safeParse({ name: input.name, description: input.description || null });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Dados inválidos.");
  const supabase = await createClient();
  const patch: Record<string, unknown> = { ...parsed.data };
  if (input.workspace_type && (TYPES as readonly string[]).includes(input.workspace_type)) patch.workspace_type = input.workspace_type;
  const { data, error } = await supabase.from("workspaces").update(patch).eq("id", id).select("id");
  if (error) return fail(friendlyDbError(error));
  if (!data?.length) return fail("Somente administradores podem editar o workspace.");
  revalidatePath("/", "layout");
  return { ok: true, data: null };
}

export async function updateWorkspaceSettingsAction(id: string, input: { allow_member_invites: boolean; default_invite_role: string; invite_expiration_days: number }): Promise<ActionResult> {
  if (!UUID.safeParse(id).success) return fail("Workspace inválido.");
  const parsed = z.object({ allow_member_invites: z.boolean(), default_invite_role: z.enum(["admin", "editor", "member", "viewer"]), invite_expiration_days: z.number().int().min(1).max(30) }).safeParse(input);
  if (!parsed.success) return fail("Configurações inválidas.");
  const supabase = await createClient();
  const { data, error } = await supabase.from("workspace_settings").update(parsed.data).eq("workspace_id", id).select("workspace_id");
  if (error) return fail(friendlyDbError(error));
  if (!data?.length) return fail("Somente administradores podem alterar as configurações.");
  revalidatePath(`/workspaces/${id}`);
  return { ok: true, data: null };
}

/** Exclusão exige digitar o nome do workspace (confirmação) e papel de owner (RLS). */
export async function deleteWorkspaceAction(id: string, confirmName: string): Promise<ActionResult> {
  if (!UUID.safeParse(id).success) return fail("Workspace inválido.");
  const ctx = await getSessionContext();
  if (!ctx) return fail("Sessão expirada.");
  const ws = ctx.workspaces.find((w) => w.id === id);
  if (!ws) return fail("Workspace não encontrado.");
  if (ws.is_personal) return fail("O workspace pessoal não pode ser excluído (exclua a conta, se desejar).");
  if (ws.role !== "owner") return fail("Somente o proprietário pode excluir o workspace.");
  if (confirmName.trim() !== ws.name) return fail("O nome digitado não confere.");
  const supabase = await createClient();
  // Remove arquivos do Storage antes da exclusão em cascata dos registros.
  const { data: docs } = await supabase.from("documents").select("storage_path").eq("workspace_id", id).limit(10000);
  const paths = ((docs ?? []) as { storage_path: string }[]).map((d) => d.storage_path);
  for (let i = 0; i < paths.length; i += 100) await supabase.storage.from("documents").remove(paths.slice(i, i + 100));
  const { data, error } = await supabase.from("workspaces").delete().eq("id", id).select("id");
  if (error) return fail(friendlyDbError(error));
  if (!data?.length) return fail("Não foi possível excluir o workspace.");
  const store = await cookies();
  if (store.get(WORKSPACE_COOKIE)?.value === id) store.delete(WORKSPACE_COOKIE);
  revalidatePath("/", "layout");
  return { ok: true, data: null };
}

export async function inviteMemberAction(workspaceId: string, email: string, role: string): Promise<ActionResult<{ link: string; expiresAt: string }>> {
  if (!UUID.safeParse(workspaceId).success) return fail("Workspace inválido.");
  const parsed = z.object({ email: z.string().trim().toLowerCase().email("E-mail inválido."), role: z.enum(["admin", "editor", "member", "viewer"]) }).safeParse({ email, role });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Dados inválidos.");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_workspace_invitation", { p_workspace_id: workspaceId, p_email: parsed.data.email, p_role: parsed.data.role });
  if (error) return fail(friendlyDbError(error));
  const row = (Array.isArray(data) ? data[0] : data) as { token: string; expires_at: string } | null;
  if (!row) return fail("Não foi possível criar o convite.");
  revalidatePath(`/workspaces/${workspaceId}`);
  // O token só existe aqui (o banco guarda apenas o hash).
  return { ok: true, data: { link: `${siteUrl()}/convites/aceitar?token=${row.token}`, expiresAt: row.expires_at } };
}

export async function revokeInvitationAction(invitationId: string, workspaceId: string): Promise<ActionResult> {
  if (!UUID.safeParse(invitationId).success) return fail("Convite inválido.");
  const supabase = await createClient();
  const { data, error } = await supabase.from("workspace_invitations").update({ revoked_at: new Date().toISOString() }).eq("id", invitationId).select("id");
  if (error) return fail(friendlyDbError(error));
  if (!data?.length) return fail("Sem permissão.");
  await supabase.rpc("log_workspace_event", { p_workspace_id: workspaceId, p_action: "invitation.revoked", p_entity_type: "workspace_invitation", p_entity_id: invitationId });
  revalidatePath(`/workspaces/${workspaceId}`);
  return { ok: true, data: null };
}

export async function changeMemberRoleAction(memberId: string, workspaceId: string, role: string): Promise<ActionResult> {
  if (!UUID.safeParse(memberId).success || !["admin", "editor", "member", "viewer"].includes(role)) return fail("Dados inválidos.");
  const supabase = await createClient();
  const { data, error } = await supabase.from("workspace_members").update({ role }).eq("id", memberId).select("id");
  if (error) return fail(friendlyDbError(error));
  if (!data?.length) return fail("Você não tem permissão para alterar este papel.");
  revalidatePath(`/workspaces/${workspaceId}`);
  return { ok: true, data: null };
}

export async function removeMemberAction(memberId: string, workspaceId: string): Promise<ActionResult> {
  if (!UUID.safeParse(memberId).success) return fail("Dados inválidos.");
  const ctx = await getSessionContext();
  if (!ctx) return fail("Sessão expirada.");
  const supabase = await createClient();
  const { data, error } = await supabase.from("workspace_members").delete().eq("id", memberId).select("id, user_id");
  if (error) return fail(friendlyDbError(error));
  if (!data?.length) return fail("Você não tem permissão para remover este membro.");
  if ((data[0] as { user_id: string }).user_id === ctx.user.id) {
    const store = await cookies();
    store.delete(WORKSPACE_COOKIE);
    revalidatePath("/", "layout");
  }
  revalidatePath(`/workspaces/${workspaceId}`);
  return { ok: true, data: null };
}

export async function transferOwnershipAction(workspaceId: string, newOwnerId: string): Promise<ActionResult> {
  if (!UUID.safeParse(workspaceId).success || !UUID.safeParse(newOwnerId).success) return fail("Dados inválidos.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("transfer_workspace_ownership", { p_workspace_id: workspaceId, p_new_owner: newOwnerId });
  if (error) return fail(friendlyDbError(error));
  revalidatePath(`/workspaces/${workspaceId}`);
  revalidatePath("/", "layout");
  return { ok: true, data: null };
}

export async function acceptInvitationAction(token: string): Promise<ActionResult<{ workspaceId: string }>> {
  if (!/^[0-9a-f]{64}$/i.test(token)) return fail("Convite inválido.");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("accept_workspace_invitation", { p_token: token });
  if (error) return fail(friendlyDbError(error));
  const store = await cookies();
  store.set(WORKSPACE_COOKIE, String(data), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 31536000 });
  revalidatePath("/", "layout");
  return { ok: true, data: { workspaceId: String(data) } };
}

export async function acceptInvitationByIdAction(id: string): Promise<ActionResult<{ workspaceId: string }>> {
  if (!UUID.safeParse(id).success) return fail("Convite inválido.");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("accept_workspace_invitation_by_id", { p_invitation_id: id });
  if (error) return fail(friendlyDbError(error));
  revalidatePath("/", "layout");
  return { ok: true, data: { workspaceId: String(data) } };
}
