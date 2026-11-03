"use client";

import * as React from "react";
import { useActionState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox, Input, Label } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import {
  requestPasswordResetAction,
  signInAction,
  signUpAction,
  updatePasswordAction,
  type AuthState,
} from "./actions";

function Field({ name, label, type = "text", autoComplete, error, hint }: {
  name: string; label: string; type?: string; autoComplete?: string; error?: string; hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} type={type} autoComplete={autoComplete} aria-invalid={error ? true : undefined} aria-describedby={error ? `${name}-err` : undefined} required />
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p id={`${name}-err`} className="text-xs text-danger" role="alert">{error}</p>}
    </div>
  );
}

function Submit({ pending, children }: { pending: boolean; children: React.ReactNode }) {
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending && <Loader2 className="animate-spin" />} {children}
    </Button>
  );
}

const initial: AuthState = {};

export function LoginForm({ next, linkError }: { next?: string; linkError?: boolean }) {
  const [state, action, pending] = useActionState(signInAction, initial);
  return (
    <form action={action} className="space-y-4">
      {linkError && <Alert tone="warning">O link utilizado é inválido ou expirou.</Alert>}
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      <input type="hidden" name="next" value={next ?? "/dashboard"} />
      <Field name="email" label="E-mail" type="email" autoComplete="email" error={state.fieldErrors?.email} />
      <Field name="password" label="Senha" type="password" autoComplete="current-password" error={state.fieldErrors?.password} />
      <div className="flex justify-end">
        <Link href="/recuperar-senha" className="text-xs text-primary hover:underline">Esqueci minha senha</Link>
      </div>
      <Submit pending={pending}>Entrar</Submit>
      <p className="text-center text-sm text-muted-foreground">
        Não tem conta? <Link href="/cadastro" className="text-primary hover:underline">Criar conta</Link>
      </p>
    </form>
  );
}

export function SignUpForm() {
  const [state, action, pending] = useActionState(signUpAction, initial);
  if (state.message) return <Alert tone="success" title="Quase lá">{state.message}</Alert>;
  return (
    <form action={action} className="space-y-4">
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      <Field name="full_name" label="Nome completo" autoComplete="name" error={state.fieldErrors?.full_name} />
      <Field name="email" label="E-mail" type="email" autoComplete="email" error={state.fieldErrors?.email} />
      <Field name="password" label="Senha" type="password" autoComplete="new-password" error={state.fieldErrors?.password} hint="Mínimo de 8 caracteres, com letras e números." />
      <Field name="confirm" label="Confirmar senha" type="password" autoComplete="new-password" error={state.fieldErrors?.confirm} />
      <div className="space-y-1">
        <label className="flex items-start gap-2 text-sm text-muted-foreground">
          <Checkbox name="consent" className="mt-0.5" />
          <span>
            Li e concordo com a <Link href="/privacidade" target="_blank" className="text-primary hover:underline">política de privacidade</Link> (LGPD).
          </span>
        </label>
        {state.fieldErrors?.consent && <p className="text-xs text-danger">{state.fieldErrors.consent}</p>}
      </div>
      <Submit pending={pending}>Criar conta</Submit>
      <p className="text-center text-sm text-muted-foreground">
        Já tem conta? <Link href="/login" className="text-primary hover:underline">Entrar</Link>
      </p>
    </form>
  );
}

export function ResetRequestForm() {
  const [state, action, pending] = useActionState(requestPasswordResetAction, initial);
  return (
    <form action={action} className="space-y-4">
      {state.message && <Alert tone="success">{state.message}</Alert>}
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      <Field name="email" label="E-mail da conta" type="email" autoComplete="email" error={state.fieldErrors?.email} />
      <Submit pending={pending}>Enviar link de redefinição</Submit>
      <p className="text-center text-sm"><Link href="/login" className="text-primary hover:underline">Voltar ao login</Link></p>
    </form>
  );
}

export function NewPasswordForm() {
  const [state, action, pending] = useActionState(updatePasswordAction, initial);
  if (state.message)
    return (
      <div className="space-y-4">
        <Alert tone="success">{state.message}</Alert>
        <Link href="/dashboard" className="block text-center text-sm text-primary hover:underline">Ir para o dashboard</Link>
      </div>
    );
  return (
    <form action={action} className="space-y-4">
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      <Field name="password" label="Nova senha" type="password" autoComplete="new-password" error={state.fieldErrors?.password} hint="Mínimo de 8 caracteres, com letras e números." />
      <Field name="confirm" label="Confirmar nova senha" type="password" autoComplete="new-password" error={state.fieldErrors?.confirm} />
      <Submit pending={pending}>Salvar nova senha</Submit>
    </form>
  );
}
