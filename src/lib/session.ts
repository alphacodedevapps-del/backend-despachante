import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { WorkspaceRole, WorkspaceType } from "@/lib/permissions";

export const WORKSPACE_COOKIE = "ca_ws";

export interface Profile {
  id: string;
  full_name: string | null;
  avatar_path: string | null;
  institution: string | null;
  course: string;
  current_period: string | null;
  city: string | null;
  bio: string | null;
  lattes_url: string | null;
  linkedin_url: string | null;
}

export interface Preferences {
  theme: "light" | "dark" | "system";
  default_workspace_id: string | null;
  notification_prefs: Record<string, boolean>;
  calendar_prefs: { week_starts_on: 0 | 1; default_view: "month" | "week" | "day" };
  srs_settings: Record<string, unknown>;
  ai_prefs: { answer_style?: string; max_sources?: number };
  sidebar_collapsed: boolean;
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  description: string | null;
  workspace_type: WorkspaceType;
  is_personal: boolean;
  owner_id: string;
  role: WorkspaceRole;
}

export interface SessionContext {
  user: { id: string; email: string };
  profile: Profile | null;
  preferences: Preferences | null;
  workspaces: WorkspaceSummary[];
  workspace: WorkspaceSummary;
}

/** Contexto da sessão (memoizado por requisição). Retorna null sem login. */
export const getSessionContext = cache(async (): Promise<SessionContext | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [profileRes, prefsRes, membersRes] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("user_preferences").select("*").eq("user_id", user.id).maybeSingle(),
    supabase
      .from("workspace_members")
      .select("role, workspaces!inner(id, name, description, workspace_type, is_personal, owner_id)")
      .eq("user_id", user.id),
  ]);

  type MemberRow = { role: WorkspaceRole; workspaces: Omit<WorkspaceSummary, "role"> | Omit<WorkspaceSummary, "role">[] };
  const workspaces: WorkspaceSummary[] = ((membersRes.data ?? []) as MemberRow[])
    .map((m) => {
      const w = Array.isArray(m.workspaces) ? m.workspaces[0] : m.workspaces;
      return { ...w, role: m.role };
    })
    .filter((w): w is WorkspaceSummary => Boolean(w?.id))
    .sort((a, b) => (a.is_personal === b.is_personal ? a.name.localeCompare(b.name, "pt-BR") : a.is_personal ? -1 : 1));

  if (workspaces.length === 0) return null;

  const preferences = (prefsRes.data as Preferences | null) ?? null;
  const cookieStore = await cookies();
  const cookieWs = cookieStore.get(WORKSPACE_COOKIE)?.value;
  const workspace =
    workspaces.find((w) => w.id === cookieWs) ??
    workspaces.find((w) => w.id === preferences?.default_workspace_id) ??
    workspaces.find((w) => w.is_personal) ??
    workspaces[0];

  return {
    user: { id: user.id, email: user.email ?? "" },
    profile: (profileRes.data as Profile | null) ?? null,
    preferences,
    workspaces,
    workspace,
  };
});

/** Exige usuário autenticado (redireciona para /login). */
export async function requireSession(): Promise<SessionContext> {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");
  return ctx;
}
