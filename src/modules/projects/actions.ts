"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/session";
import { fail, friendlyDbError, type ActionResult } from "@/lib/errors";

const UUID = z.string().regex(/^[0-9a-f-]{36}$/i);

export async function addStageAction(projectId: string, title: string, dueDate: string | null): Promise<ActionResult> {
  const parsed = z.object({ projectId: UUID, title: z.string().trim().min(1, "Informe o título da etapa.").max(200), dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable() }).safeParse({ projectId, title, dueDate: dueDate || null });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Dados inválidos.");
  const ctx = await getSessionContext();
  if (!ctx) return fail("Sessão expirada.");
  const supabase = await createClient();
  const { data: project } = await supabase.from("projects").select("workspace_id").eq("id", projectId).maybeSingle();
  if (!project) return fail("Projeto não encontrado.");
  const { count } = await supabase.from("project_stages").select("id", { count: "exact", head: true }).eq("project_id", projectId);
  const { error } = await supabase.from("project_stages").insert({
    project_id: projectId,
    workspace_id: project.workspace_id,
    created_by: ctx.user.id,
    title: parsed.data.title,
    due_date: parsed.data.dueDate,
    position: count ?? 0,
  });
  if (error) return fail(friendlyDbError(error));
  revalidatePath(`/projetos/${projectId}`);
  return { ok: true, data: null };
}

export async function updateStageAction(stageId: string, patch: { is_done?: boolean; title?: string; position?: number }): Promise<ActionResult> {
  if (!UUID.safeParse(stageId).success) return fail("Etapa inválida.");
  const parsed = z.object({ is_done: z.boolean().optional(), title: z.string().trim().min(1).max(200).optional(), position: z.number().int().min(0).max(10000).optional() }).safeParse(patch);
  if (!parsed.success) return fail("Dados inválidos.");
  const supabase = await createClient();
  const { data, error } = await supabase.from("project_stages").update(parsed.data).eq("id", stageId).select("project_id");
  if (error) return fail(friendlyDbError(error));
  if (!data?.length) return fail("Sem permissão para alterar esta etapa.");
  revalidatePath(`/projetos/${data[0].project_id}`);
  return { ok: true, data: null };
}

export async function deleteStageAction(stageId: string): Promise<ActionResult> {
  if (!UUID.safeParse(stageId).success) return fail("Etapa inválida.");
  const supabase = await createClient();
  const { data, error } = await supabase.from("project_stages").delete().eq("id", stageId).select("project_id");
  if (error) return fail(friendlyDbError(error));
  if (!data?.length) return fail("Sem permissão para excluir esta etapa.");
  revalidatePath(`/projetos/${data[0].project_id}`);
  return { ok: true, data: null };
}
