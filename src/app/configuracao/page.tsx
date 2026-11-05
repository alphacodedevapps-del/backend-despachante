import type { Metadata } from "next";
import Link from "next/link";
import { getSupabaseEnv } from "@/lib/supabase/env";

export const metadata: Metadata = { title: "Configuração necessária" };

export default function SetupPage() {
  const { configured } = getSupabaseEnv();
  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-2xl font-semibold">Configuração do Supabase</h1>
      {configured ? (
        <p className="mt-3 text-sm text-success">O Supabase está configurado. Acesse <Link className="text-primary underline" href="/login">/login</Link>.</p>
      ) : (
        <div className="prose-content mt-4 text-sm">
          <p>A aplicação precisa de um projeto Supabase para funcionar. Nenhum dado é simulado.</p>
          <ol>
            <li>Crie um projeto em supabase.com.</li>
            <li>Aplique as migrations de <code>supabase/migrations</code> (<code>supabase db push</code> ou SQL Editor, na ordem).</li>
            <li>Copie <code>.env.example</code> para <code>.env.local</code> e preencha <code>NEXT_PUBLIC_SUPABASE_URL</code> e <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>.</li>
            <li>Reinicie o servidor (<code>npm run dev</code>).</li>
          </ol>
          <p>Instruções completas no README.md.</p>
        </div>
      )}
    </main>
  );
}
