import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { requireSupabaseEnv } from "./env";

/** Cliente Supabase para Server Components, Server Actions e Route Handlers (sessão do usuário, RLS aplicada). */
export async function createClient() {
  // Ler os cookies primeiro torna a rota dinâmica (nunca pré-renderizada sem sessão).
  const cookieStore = await cookies();
  const { url, anonKey } = requireSupabaseEnv();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Chamado a partir de um Server Component: o proxy renova a sessão.
        }
      },
    },
  });
}
