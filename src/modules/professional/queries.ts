import "server-only";
import { createClient } from "@/lib/supabase/server";

export interface CvData {
  portfolio: { id: string; title: string; item_type: string; institution: string | null; role: string | null; start_date: string | null; end_date: string | null; description: string | null; url: string | null }[];
  certificates: { id: string; title: string; certificate_type: string; institution: string | null; issue_date: string | null; hours: number | null }[];
  internships: { id: string; institution: string; location: string | null; area: string | null; start_date: string | null; end_date: string | null; competencies: string | null }[];
  projects: { id: string; name: string; project_type: string; status: string; start_date: string | null; due_date: string | null }[];
  league: { title: string; activity_type: string; starts_at: string | null; hours: number | null }[];
  hours: number;
}

export async function getCvData(workspaceId: string): Promise<CvData> {
  const supabase = await createClient();
  const [portfolio, certificates, internships, projects, league, hours] = await Promise.all([
    supabase.from("portfolio_items").select("id, title, item_type, institution, role, start_date, end_date, description, url").eq("workspace_id", workspaceId).eq("include_in_cv", true).order("start_date", { ascending: false, nullsFirst: false }),
    supabase.from("certificates").select("id, title, certificate_type, institution, issue_date, hours").eq("workspace_id", workspaceId).order("issue_date", { ascending: false, nullsFirst: false }),
    supabase.from("internships").select("id, institution, location, area, start_date, end_date, competencies").eq("workspace_id", workspaceId).order("start_date", { ascending: false, nullsFirst: false }),
    supabase.from("projects").select("id, name, project_type, status, start_date, due_date").eq("workspace_id", workspaceId).order("due_date", { ascending: false, nullsFirst: false }).limit(100),
    supabase.from("league_activities").select("title, activity_type, starts_at, hours").eq("workspace_id", workspaceId).eq("status", "realizada").in("activity_type", ["aula", "palestra", "evento", "congresso", "projeto_extensao", "projeto_cientifico"]).order("starts_at", { ascending: false }).limit(100),
    supabase.from("complementary_activities").select("hours").eq("workspace_id", workspaceId).eq("status", "validada").limit(5000),
  ]);
  return {
    portfolio: (portfolio.data ?? []) as CvData["portfolio"],
    certificates: (certificates.data ?? []) as CvData["certificates"],
    internships: (internships.data ?? []) as CvData["internships"],
    projects: (projects.data ?? []) as CvData["projects"],
    league: (league.data ?? []) as CvData["league"],
    hours: ((hours.data ?? []) as { hours: number }[]).reduce((s, r) => s + Number(r.hours), 0),
  };
}
