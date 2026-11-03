import { requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { MobileNav } from "@/components/layout/mobile-nav";
import { ThemeSync } from "@/components/layout/theme";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireSession();
  const supabase = await createClient();
  // Gera notificações devidas (idempotente) e conta as não lidas.
  await supabase.rpc("generate_my_notifications");
  const { count } = await supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null);

  return (
    <div className="flex min-h-dvh">
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2">
        Pular para o conteúdo
      </a>
      <Sidebar initialCollapsed={ctx.preferences?.sidebar_collapsed ?? false} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header
          userName={ctx.profile?.full_name ?? ""}
          email={ctx.user.email}
          unread={count ?? 0}
          workspaces={ctx.workspaces.map((w) => ({ id: w.id, name: w.name, workspace_type: w.workspace_type, is_personal: w.is_personal, role: w.role }))}
          currentWorkspaceId={ctx.workspace.id}
        />
        <main id="conteudo" className="mx-auto w-full max-w-7xl flex-1 px-4 pb-24 pt-5 sm:px-6 lg:pb-10 lg:pt-7">
          {children}
        </main>
      </div>
      <MobileNav />
      <ThemeSync serverTheme={ctx.preferences?.theme ?? null} />
    </div>
  );
}
