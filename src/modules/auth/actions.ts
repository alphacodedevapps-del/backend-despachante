"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/supabase/env";

export interface AuthState {
  error?: string;
  message?: string;
  fieldErrors?: Record<string, string>;
}

const email = z.string().trim().toLowerCase().email("Informe um e-mail válido.").max(320);
const password = z
  .string()
  .min(8, "A senha deve ter pelo menos 8 caracteres.")
  .max(72, "A senha deve ter no máximo 72 caracteres.")
  .regex(/[A-Za-z]/, "Inclua ao menos uma letra.")
  .regex(/\d/, "Inclua ao menos um número.");

function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of error.issues) {
    const k = String(i.path[0] ?? "_");
    if (!out[k]) out[k] = i.message;
  }
  return out;
}

function safeNext(next: FormDataEntryValue | null): string {
  const n = typeof next === "string" ? next : "";
  return n.startsWith("/") && !n.startsWith("//") ? n : "/dashboard";
}

function translateAuthError(message: string): string {
  if (/invalid login credentials/i.test(message)) return "E-mail ou senha incorretos.";
  if (/email not confirmed/i.test(message)) return "Confirme seu e-mail antes de entrar (verifique sua caixa de entrada).";
  if (/already registered|already exists/i.test(message)) return "Já existe uma conta com este e-mail.";
  if (/rate limit|too many/i.test(message)) return "Muitas tentativas. Aguarde alguns minutos e tente novamente.";
  if (/weak|pwned/i.test(message)) return "Senha fraca ou exposta em vazamentos. Escolha outra.";
  return "Não foi possível concluir a autenticação. Tente novamente.";
}

export async function signInAction(_: AuthState, form: FormData): Promise<AuthState> {
  const parsed = z.object({ email, password: z.string().min(1, "Informe a senha.") }).safeParse({
    email: form.get("email"),
    password: form.get("password"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: translateAuthError(error.message) };
  redirect(safeNext(form.get("next")));
}

export async function signUpAction(_: AuthState, form: FormData): Promise<AuthState> {
  const parsed = z
    .object({
      full_name: z.string().trim().min(2, "Informe seu nome.").max(160),
      email,
      password,
      confirm: z.string(),
      consent: z.literal("on", { error: "É necessário aceitar a política de privacidade." }),
    })
    .refine((d) => d.password === d.confirm, { path: ["confirm"], message: "As senhas não coincidem." })
    .safeParse({
      full_name: form.get("full_name"),
      email: form.get("email"),
      password: form.get("password"),
      confirm: form.get("confirm"),
      consent: form.get("consent"),
    });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.full_name },
      emailRedirectTo: `${siteUrl()}/auth/callback?next=/dashboard`,
    },
  });
  if (error) return { error: translateAuthError(error.message) };
  if (data.session) redirect("/dashboard");
  return { message: "Conta criada! Enviamos um link de confirmação para o seu e-mail." };
}

export async function requestPasswordResetAction(_: AuthState, form: FormData): Promise<AuthState> {
  const parsed = z.object({ email }).safeParse({ email: form.get("email") });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${siteUrl()}/auth/callback?next=/auth/redefinir-senha`,
  });
  // Resposta neutra: não revela se o e-mail existe.
  return { message: "Se houver uma conta com este e-mail, você receberá um link para redefinir a senha." };
}

export async function updatePasswordAction(_: AuthState, form: FormData): Promise<AuthState> {
  const parsed = z
    .object({ password, confirm: z.string() })
    .refine((d) => d.password === d.confirm, { path: ["confirm"], message: "As senhas não coincidem." })
    .safeParse({ password: form.get("password"), confirm: form.get("confirm") });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { error: "Link expirado ou inválido. Solicite uma nova redefinição." };
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: translateAuthError(error.message) };
  return { message: "Senha atualizada com sucesso." };
}
