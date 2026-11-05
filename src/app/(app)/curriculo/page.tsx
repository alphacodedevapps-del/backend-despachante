import type * as React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { requireSession } from "@/lib/session";
import { formatDate, formatNumber } from "@/lib/utils/format";
import { ENTITY_MAP, optionLabel } from "@/modules/entities/definitions";
import { getCvData } from "@/modules/professional/queries";
import { PrintButton } from "@/modules/professional/print-button";

export const metadata: Metadata = { title: "Currículo" };

const period = (a: string | null, b: string | null) => [a ? formatDate(a) : null, b ? formatDate(b) : a ? "atual" : null].filter(Boolean).join(" – ");

function Section({ title, children, empty }: { title: string; children: React.ReactNode; empty: boolean }) {
  if (empty) return null;
  return (
    <section className="break-inside-avoid">
      <h2 className="mb-2 border-b border-border pb-1 text-sm font-semibold uppercase tracking-wide text-primary print:text-black">{title}</h2>
      <ul className="space-y-2 text-sm">{children}</ul>
    </section>
  );
}

export default async function CvPage() {
  const ctx = await requireSession();
  const d = await getCvData(ctx.workspace.id);
  const p = ctx.profile;
  const typeOf = (key: string, field: string, v: string) => optionLabel(ENTITY_MAP[key].fields.find((f) => f.name === field)!, v);
  const byType = (types: string[]) => d.portfolio.filter((i) => types.includes(i.item_type));
  const empty = d.portfolio.length + d.certificates.length + d.internships.length === 0;

  return (
    <div>
      <div className="no-print">
        <PageHeader title="Currículo" description="Gerado automaticamente a partir do seu perfil, portfólio, estágios, certificados e projetos." icon="FileUser"
          actions={<><Link href="/perfil" className={buttonVariants({ variant: "outline" })}>Editar perfil</Link><Link href="/portfolio/novo" className={buttonVariants({ variant: "outline" })}>Adicionar item</Link><PrintButton /></>} />
        {empty && <p className="mb-4 text-sm text-muted-foreground">Cadastre itens no Portfólio, Estágios e Certificados para compor o currículo.</p>}
      </div>
      <article className="mx-auto max-w-3xl space-y-6 rounded-lg border border-border bg-surface p-6 sm:p-10 print:border-0 print:p-0">
        <header>
          <h1 className="text-2xl font-semibold">{p?.full_name || ctx.user.email}</h1>
          <p className="text-sm text-muted-foreground">{[p?.course, p?.current_period, p?.institution, p?.city].filter(Boolean).join(" · ")}</p>
          <p className="text-sm text-muted-foreground">{ctx.user.email}{p?.lattes_url ? ` · Lattes: ${p.lattes_url}` : ""}{p?.linkedin_url ? ` · ${p.linkedin_url}` : ""}</p>
          {p?.bio && <p className="mt-3 text-sm leading-relaxed">{p.bio}</p>}
        </header>
        <Section title="Formação" empty={byType(["formacao"]).length === 0}>
          {byType(["formacao"]).map((i) => <li key={i.id}><strong>{i.title}</strong>{i.institution ? ` — ${i.institution}` : ""} <span className="text-muted-foreground">{period(i.start_date, i.end_date)}</span></li>)}
        </Section>
        <Section title="Estágios" empty={d.internships.length === 0}>
          {d.internships.map((i) => <li key={i.id}><strong>{i.institution}</strong>{i.location ? ` — ${i.location}` : ""}{i.area ? ` (${typeOf("internships", "area", i.area)})` : ""} <span className="text-muted-foreground">{period(i.start_date, i.end_date)}</span>{i.competencies && <p className="text-muted-foreground">{i.competencies}</p>}</li>)}
        </Section>
        <Section title="Experiências, monitorias e extensão" empty={byType(["experiencia", "monitoria", "extensao"]).length === 0}>
          {byType(["experiencia", "monitoria", "extensao"]).map((i) => <li key={i.id}><strong>{i.title}</strong>{i.role ? `, ${i.role}` : ""}{i.institution ? ` — ${i.institution}` : ""} <span className="text-muted-foreground">{period(i.start_date, i.end_date)}</span>{i.description && <p className="text-muted-foreground">{i.description}</p>}</li>)}
        </Section>
        <Section title="Produção científica" empty={byType(["publicacao", "apresentacao"]).length + d.projects.filter((x) => x.status === "concluido").length === 0}>
          {byType(["publicacao", "apresentacao"]).map((i) => <li key={i.id}><strong>{i.title}</strong> <span className="text-muted-foreground">({typeOf("portfolio_items", "item_type", i.item_type)}{i.start_date ? `, ${i.start_date.slice(0, 4)}` : ""})</span></li>)}
          {d.projects.filter((x) => x.status === "concluido").map((x) => <li key={x.id}>{x.name} <span className="text-muted-foreground">({typeOf("projects", "project_type", x.project_type)})</span></li>)}
        </Section>
        <Section title="Cursos, eventos e certificados" empty={d.certificates.length === 0}>
          {d.certificates.map((c) => <li key={c.id}>{c.title}{c.institution ? ` — ${c.institution}` : ""} <span className="text-muted-foreground">({typeOf("certificates", "certificate_type", c.certificate_type)}{c.hours ? `, ${formatNumber(Number(c.hours), 1)} h` : ""}{c.issue_date ? `, ${formatDate(c.issue_date)}` : ""})</span></li>)}
        </Section>
        <Section title="Competências e idiomas" empty={byType(["competencia", "idioma"]).length === 0}>
          {byType(["competencia", "idioma"]).map((i) => <li key={i.id}>{i.title}{i.description ? ` — ${i.description}` : ""}</li>)}
        </Section>
        <Section title="Prêmios e distinções" empty={byType(["premio"]).length === 0}>
          {byType(["premio"]).map((i) => <li key={i.id}>{i.title}{i.institution ? ` — ${i.institution}` : ""}</li>)}
        </Section>
        {d.hours > 0 && <p className="text-sm text-muted-foreground">Horas complementares validadas: {formatNumber(d.hours, 1)} h.</p>}
      </article>
    </div>
  );
}
