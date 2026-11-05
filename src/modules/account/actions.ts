"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionContext, WORKSPACE_COOKIE } from "@/lib/session";
import { fail, friendlyDbError, type ActionResult } from "@/lib/errors";

const opt = (max: number) => z.string().trim().max(max).nullable();
const profileSchema = z.object({
  full_name: z.string().trim().min(2, "Informe seu nome.").max(160),
  institution: opt(200),
  course: z.string().trim().min(1).max(120),
  current_period: opt(40),
  city: opt(120),
  bio: opt(2000),
  lattes_url: z.string().trim().regex(/^https?:\/\/\S+$/, "URL do Lattes inválida.").nullable(),
  linkedin_url: z.string().trim().regex(/^https?:\/\/\S+$/, "URL do LinkedIn inválida.").nullable(),
});

export async function updateProfileAction(raw: Record<string, string>): Promise<ActionResult> {
  const clean = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, typeof v === "string" && v.trim() === "" ? null : v]));
  const parsed = profileSchema.safeParse({ ...clean, course: clean.course ?? "Fisioterapia" });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Dados inválidos.");
  const ctx = await getSessionContext();
  if (!ctx) return fail("Sessão expirada.");
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update(parsed.data).eq("id", ctx.user.id);
  if (error) return fail(friendlyDbError(error));
  revalidatePath("/", "layout");
  return { ok: true, data: null };
}

/** Upload de avatar (até 2 MB, PNG/JPEG) no bucket privado "avatars". */
export async function uploadAvatarAction(form: FormData): Promise<ActionResult> {
  const ctx = await getSessionContext();
  if (!ctx) return fail("Sessão expirada.");
  const file = form.get("avatar");
  if (!(file instanceof File) || file.size === 0) return fail("Selecione uma imagem.");
  if (file.size > 2 * 1024 * 1024) return fail("A imagem deve ter até 2 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const isPng = bytes[0] === 0x89 && bytes[1] === 0x50;
  const isJpg = bytes[0] === 0xff && bytes[1] === 0xd8;
  if (!isPng && !isJpg) return fail("Envie uma imagem PNG ou JPG.");
  const path = `${ctx.user.id}/avatar.${isPng ? "png" : "jpg"}`;
  const supabase = await createClient();
  if (ctx.profile?.avatar_path && ctx.profile.avatar_path !== path) await supabase.storage.from("avatars").remove([ctx.profile.avatar_path]);
  const { error } = await supabase.storage.from("avatars").upload(path, bytes, { contentType: isPng ? "image/png" : "image/jpeg", upsert: true });
  if (error) return fail("Não foi possível enviar a imagem.");
  await supabase.from("profiles").update({ avatar_path: path }).eq("id", ctx.user.id);
  revalidatePath("/perfil");
  return { ok: true, data: null };
}

export async function removeAvatarAction(): Promise<ActionResult> {
  const ctx = await getSessionContext();
  if (!ctx) return fail("Sessão expirada.");
  const supabase = await createClient();
  if (ctx.profile?.avatar_path) await supabase.storage.from("avatars").remove([ctx.profile.avatar_path]);
  await supabase.from("profiles").update({ avatar_path: null }).eq("id", ctx.user.id);
  revalidatePath("/perfil");
  return { ok: true, data: null };
}

const prefsSchema = z.object({
  theme: z.enum(["light", "dark", "system"]),
  notification_prefs: z.record(z.string(), z.boolean()),
  calendar_prefs: z.object({ week_starts_on: z.union([z.literal(0), z.literal(1)]), default_view: z.enum(["month", "week", "day"]) }),
  srs_settings: z.object({
    initial_ease: z.number().min(1.3).max(4),
    min_ease: z.number().min(1.1).max(2.5),
    easy_bonus: z.number().min(1).max(3),
    hard_interval_factor: z.number().min(1).max(2),
    max_interval_days: z.number().int().min(7).max(3650),
    first_intervals: z.tuple([z.number().int().min(1).max(30), z.number().int().min(1).max(90)]),
  }),
});

export async function updatePreferencesAction(input: z.input<typeof prefsSchema>): Promise<ActionResult> {
  const parsed = prefsSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Preferências inválidas.");
  const allowedKeys = ["prazos", "provas", "tarefas_atrasadas", "convites", "liga", "projetos", "revisoes", "metas"];
  const notif = Object.fromEntries(allowedKeys.map((k) => [k, parsed.data.notification_prefs[k] !== false]));
  const ctx = await getSessionContext();
  if (!ctx) return fail("Sessão expirada.");
  const supabase = await createClient();
  const { error } = await supabase.from("user_preferences").update({ ...parsed.data, notification_prefs: notif }).eq("user_id", ctx.user.id);
  if (error) return fail(friendlyDbError(error));
  revalidatePath("/", "layout");
  return { ok: true, data: null };
}

export async function changePasswordAction(password: string, confirm: string): Promise<ActionResult> {
  const parsed = z.string().min(8, "Mínimo de 8 caracteres.").max(72).regex(/[A-Za-z]/, "Inclua letras.").regex(/\d/, "Inclua números.").safeParse(password);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Senha inválida.");
  if (password !== confirm) return fail("As senhas não coincidem.");
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return fail("Não foi possível alterar a senha. Tente sair e entrar novamente.");
  return { ok: true, data: null };
}

export async function signOutEverywhereAction(): Promise<ActionResult> {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "global" });
  const store = await cookies();
  store.delete(WORKSPACE_COOKIE);
  return { ok: true, data: null };
}

/**
 * Exclusão de conta (LGPD). Remove arquivos do Storage dos workspaces de que o
 * usuário é proprietário, depois exclui o usuário via API administrativa
 * (somente servidor). Perfil, workspaces próprios e conteúdos são removidos
 * em cascata; conteúdos criados em workspaces de terceiros permanecem sem autoria.
 */
export async function deleteAccountAction(confirmEmail: string): Promise<ActionResult> {
  const ctx = await getSessionContext();
  if (!ctx) return fail("Sessão expirada.");
  if (confirmEmail.trim().toLowerCase() !== ctx.user.email.toLowerCase()) return fail("O e-mail digitado não confere.");
  const admin = createAdminClient();
  if (!admin) return fail("A exclusão de conta requer SUPABASE_SERVICE_ROLE_KEY configurada no servidor. Contate o administrador.");
  const owned = ctx.workspaces.filter((w) => w.role === "owner").map((w) => w.id);
  if (owned.length) {
    const { data: docs } = await admin.from("documents").select("storage_path").in("workspace_id", owned).limit(50000);
    const paths = ((docs ?? []) as { storage_path: string }[]).map((d) => d.storage_path);
    for (let i = 0; i < paths.length; i += 100) await admin.storage.from("documents").remove(paths.slice(i, i + 100));
  }
  if (ctx.profile?.avatar_path) await admin.storage.from("avatars").remove([ctx.profile.avatar_path]);
  await admin.from("workspace_audit_logs").insert({ workspace_id: null, actor_id: null, action: "account.deleted", entity_type: "user", entity_id: ctx.user.id, details: {} });
  const { error } = await admin.auth.admin.deleteUser(ctx.user.id);
  if (error) return fail("Não foi possível excluir a conta.");
  const supabase = await createClient();
  await supabase.auth.signOut();
  const store = await cookies();
  store.delete(WORKSPACE_COOKIE);
  return { ok: true, data: null };
}
