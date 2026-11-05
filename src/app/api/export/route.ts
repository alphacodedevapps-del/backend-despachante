import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/session";
import { ENTITIES } from "@/modules/entities/definitions";

export const maxDuration = 60;

const EXTRA_TABLES = ["documents", "article_collection_items", "project_stages", "flashcard_reviews", "quizzes", "quiz_questions", "quiz_attempts", "league_profiles", "entity_links", "ai_conversations", "ai_messages"];

/** Exportação dos dados criados pelo usuário (portabilidade — LGPD). */
export async function GET() {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const supabase = await createClient();
  const out: Record<string, unknown> = {
    exported_at: new Date().toISOString(),
    user: { id: ctx.user.id, email: ctx.user.email },
    profile: ctx.profile,
    preferences: ctx.preferences,
    workspaces: ctx.workspaces.map((w) => ({ id: w.id, name: w.name, type: w.workspace_type, role: w.role })),
    note: "Contém os registros criados por você em todos os seus workspaces. Arquivos binários não são incluídos; use o download em Arquivos.",
  };
  const tables = [...ENTITIES.map((e) => e.key), ...EXTRA_TABLES];
  const data: Record<string, unknown[]> = {};
  for (const t of tables) {
    const { data: rows } = await supabase.from(t).select("*").eq("created_by", ctx.user.id).limit(50000);
    data[t] = ((rows ?? []) as Record<string, unknown>[]).map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => k !== "embedding" && k !== "fts")));
  }
  const { data: notifications } = await supabase.from("notifications").select("*").eq("user_id", ctx.user.id).limit(5000);
  data.notifications = notifications ?? [];
  const { data: usage } = await supabase.from("ai_usage_logs").select("*").eq("user_id", ctx.user.id).limit(50000);
  data.ai_usage_logs = usage ?? [];
  out.data = data;

  await supabase.rpc("log_workspace_event", { p_workspace_id: null, p_action: "data.exported", p_entity_type: "user", p_entity_id: ctx.user.id, p_details: {} });

  return new NextResponse(JSON.stringify(out, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="central-academica-dados-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
