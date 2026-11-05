"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/session";
import { canWrite } from "@/lib/permissions";
import { fail, friendlyDbError, type ActionResult } from "@/lib/errors";

const schema = z.object({
  name: z.string().trim().min(1, "Informe o nome da liga.").max(200),
  acronym: z.string().trim().max(30).nullable(),
  institution: z.string().trim().max(200).nullable(),
  foundation_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  advisor: z.string().trim().max(200).nullable(),
  description: z.string().max(10000).nullable(),
  objectives: z.string().max(10000).nullable(),
  focus_areas: z.string().max(2000).nullable(),
  contact_email: z.string().trim().regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/, "E-mail inválido.").nullable(),
});

export async function saveLeagueProfileAction(raw: Record<string, string>): Promise<ActionResult> {
  const clean = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, typeof v === "string" && v.trim() === "" ? null : v]));
  const parsed = schema.safeParse(clean);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Dados inválidos.");
  const ctx = await getSessionContext();
  if (!ctx) return fail("Sessão expirada.");
  if (!canWrite(ctx.workspace.role)) return fail("Somente leitura neste workspace.");
  const supabase = await createClient();
  const { data: existing } = await supabase.from("league_profiles").select("id").eq("workspace_id", ctx.workspace.id).maybeSingle();
  const { error } = existing
    ? await supabase.from("league_profiles").update(parsed.data).eq("id", existing.id)
    : await supabase.from("league_profiles").insert({ ...parsed.data, workspace_id: ctx.workspace.id, created_by: ctx.user.id });
  if (error) return fail(friendlyDbError(error));
  revalidatePath("/liga");
  return { ok: true, data: null };
}
