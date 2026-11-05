import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/shared/page-header";
import { StatTile, ListCard, ListRow } from "@/components/dashboard/widgets";
import { requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { canWrite } from "@/lib/permissions";
import { formatDate, formatDateTime, formatNumber } from "@/lib/utils/format";
import { ENTITY_MAP, optionLabel, BODY_REGIONS } from "@/modules/entities/definitions";
import { LeagueProfileDialog } from "@/modules/league/profile-dialog";

export const metadata: Metadata = { title: "Painel da liga" };

export default async function LeaguePage() {
  const ctx = await requireSession();
  const ws = ctx.workspace.id;
  const supabase = await createClient();
  const now = new Date().toISOString();
  const [{ data: profile }, members, upcoming, recent, certs, hoursRes] = await Promise.all([
    supabase.from("league_profiles").select("*").eq("workspace_id", ws).maybeSingle(),
    supabase.from("league_members").select("id, name, position, status").eq("workspace_id", ws).eq("status", "ativo").order("name").limit(50),
    supabase.from("league_activities").select("id, title, activity_type, starts_at, location").eq("workspace_id", ws).gte("starts_at", now).neq("status", "cancelada").order("starts_at").limit(6),
    supabase.from("league_activities").select("id, title, activity_type, starts_at").eq("workspace_id", ws).lt("starts_at", now).order("starts_at", { ascending: false }).limit(6),
    supabase.from("certificates").select("id", { count: "exact", head: true }).eq("workspace_id", ws).eq("certificate_type", "liga"),
    supabase.from("league_activities").select("hours").eq("workspace_id", ws).eq("status", "realizada").limit(5000),
  ]);
  const hours = ((hoursRes.data ?? []) as { hours: number | null }[]).reduce((s, r) => s + Number(r.hours ?? 0), 0);
  const typeField = ENTITY_MAP.league_activities.fields.find((f) => f.name === "activity_type")!;
  const posField = ENTITY_MAP.league_members.fields.find((f) => f.name === "position")!;
  const M = (members.data ?? []) as { id: string; name: string; position: string }[];
  const p = profile as Record<string, string | null> | null;

  return (
    <div className="space-y-6">
      <PageHeader title={p?.name ?? "Painel da liga"} description={p ? [p.acronym, p.institution].filter(Boolean).join(" · ") || "Liga acadêmica" : "Liga Acadêmica de Traumatologia e Ortopedia"} icon="Network"
        actions={canWrite(ctx.workspace.role) ? <><LeagueProfileDialog initial={p ?? {}} label={p ? "Editar informações" : "Cadastrar liga"} /><Link href="/liga-atividades/novo" className={buttonVariants()}><Plus /> Atividade</Link></> : undefined} />
      {ctx.workspace.workspace_type !== "liga" && (
        <Alert tone="info" title="Dica">Para compartilhar a liga com outros membros, crie um workspace do tipo “Liga acadêmica” em <Link href="/workspaces?novo=1" className="text-primary underline">Workspaces</Link> e convide-os. Os dados abaixo pertencem ao workspace atual (“{ctx.workspace.name}”).</Alert>
      )}
      {p && (p.description || p.objectives) && (
        <Card>
          <CardContent className="grid gap-4 pt-5 text-sm md:grid-cols-2">
            {p.description && <div><p className="mb-1 text-xs font-medium uppercase text-muted-foreground">Informações gerais</p><p className="whitespace-pre-wrap">{p.description}</p></div>}
            {p.objectives && <div><p className="mb-1 text-xs font-medium uppercase text-muted-foreground">Objetivos</p><p className="whitespace-pre-wrap">{p.objectives}</p></div>}
            {(p.advisor || p.foundation_date) && <p className="text-xs text-muted-foreground md:col-span-2">{p.advisor ? `Orientação: ${p.advisor}` : ""}{p.foundation_date ? ` · Fundada em ${formatDate(p.foundation_date)}` : ""}</p>}
          </CardContent>
        </Card>
      )}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Membros ativos" value={M.length} icon="Users" href="/liga-membros" />
        <StatTile label="Próximas atividades" value={(upcoming.data ?? []).length} icon="CalendarDays" href="/liga-atividades" />
        <StatTile label="Certificados da liga" value={certs.count ?? 0} icon="Award" href="/liga-certificados" />
        <StatTile label="Horas realizadas" value={formatNumber(hours, 1)} icon="Clock" href="/liga-atividades?status=realizada" />
      </section>
      <div className="grid gap-6 lg:grid-cols-3">
        <ListCard title="Calendário — próximas" href="/agenda?categoria=liga" empty="Nenhuma atividade agendada.">
          {((upcoming.data ?? []) as { id: string; title: string; activity_type: string; starts_at: string; location: string | null }[]).map((a) => (
            <ListRow key={a.id} href={`/liga-atividades/${a.id}`} title={a.title} meta={`${formatDateTime(a.starts_at)}${a.location ? ` · ${a.location}` : ""}`} right={<Badge>{optionLabel(typeField, a.activity_type)}</Badge>} />
          ))}
        </ListCard>
        <ListCard title="Atividades recentes" href="/liga-atividades" empty="Nenhuma atividade registrada.">
          {((recent.data ?? []) as { id: string; title: string; activity_type: string; starts_at: string }[]).map((a) => (
            <ListRow key={a.id} href={`/liga-atividades/${a.id}`} title={a.title} meta={formatDate(a.starts_at)} right={<Badge>{optionLabel(typeField, a.activity_type)}</Badge>} />
          ))}
        </ListCard>
        <ListCard title="Membros e cargos" href="/liga-membros" empty="Nenhum membro cadastrado.">
          {M.slice(0, 8).map((m) => <ListRow key={m.id} href={`/liga-membros/${m.id}`} title={m.name} right={<Badge tone="primary">{optionLabel(posField, m.position)}</Badge>} />)}
        </ListCard>
      </div>
      <Card>
        <CardHeader><CardTitle>Banco de conhecimento anatômico</CardTitle><Link href="/liga/regioes" className="text-xs text-primary hover:underline">Abrir</Link></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {BODY_REGIONS.slice(0, 9).map((r) => <Link key={r.value} href={`/liga/regioes?regiao=${r.value}`} className="rounded-full border border-border px-3 py-1 text-sm hover:border-primary/40 hover:text-primary">{r.label}</Link>)}
        </CardContent>
      </Card>
      <div className="flex flex-wrap gap-2 text-sm">
        {[["/liga-reunioes", "Reuniões"], ["/liga-aulas", "Aulas e palestras"], ["/liga-eventos", "Eventos e congressos"], ["/liga-projetos", "Projetos e atividades"], ["/artigos", "Artigos discutidos"], ["/horas-complementares", "Horas complementares"]].map(([h, l]) => (
          <Link key={h} href={h} className={buttonVariants({ variant: "outline", size: "sm" })}>{l}</Link>
        ))}
      </div>
    </div>
  );
}
