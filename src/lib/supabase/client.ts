"use client";
import { createBrowserClient } from "@supabase/ssr";

/** Cliente para o navegador (sessão em cookies; somente chave anon pública). */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("Supabase não configurado.");
  return createBrowserClient(url, anonKey);
}
