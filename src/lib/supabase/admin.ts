import "server-only";
import { createClient } from "@supabase/supabase-js";
import { requireSupabaseEnv } from "./env";

/**
 * Cliente com service role — SOMENTE no servidor e apenas para operações
 * administrativas explícitas (ex.: exclusão de conta). Nunca importe em
 * componentes cliente.
 */
export function createAdminClient() {
  const { url } = requireSupabaseEnv();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
