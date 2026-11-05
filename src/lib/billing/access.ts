import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type AccessStatus = "admin" | "ativo" | "teste" | "vencido" | "bloqueado" | "sem_assinatura";

export interface Access {
  allowed: boolean;
  status: AccessStatus;
  isAdmin: boolean;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  priceCents: number;
}

/** Situação de acesso do usuário logado (memoizada por requisição). */
export const getAccess = cache(async (): Promise<Access> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_access");
  const row = (Array.isArray(data) ? data[0] : data) as
    | { allowed: boolean; status: AccessStatus; is_admin: boolean; trial_ends_at: string | null; current_period_end: string | null; price_cents: number }
    | undefined;
  if (error || !row) return { allowed: false, status: "sem_assinatura", isAdmin: false, trialEndsAt: null, currentPeriodEnd: null, priceCents: 3990 };
  return { allowed: row.allowed, status: row.status, isAdmin: row.is_admin, trialEndsAt: row.trial_ends_at, currentPeriodEnd: row.current_period_end, priceCents: row.price_cents };
});

/** Dias inteiros restantes até a data (0 se já passou). */
export function daysUntil(iso: string | null, now: number = Date.now()): number {
  return iso ? Math.max(0, Math.ceil((new Date(iso).getTime() - now) / 86400000)) : 0;
}

/** Para rotas e ações que consomem recursos (IA): exige acesso ativo. */
export async function hasActiveAccess(): Promise<boolean> {
  return (await getAccess()).allowed;
}
