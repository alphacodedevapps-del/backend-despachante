import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/shared/page-header";
import { requireSession } from "@/lib/session";
import { formatDate, formatNumber } from "@/lib/utils/format";
import { getCvData } from "@/modules/professional/queries";
import { CopyTextButton } from "@/modules/professional/print-button";

export const metadata: Metadata = { title: "Lattes" };

export default async function LattesPage() {
  const ctx = await requireSession();
  const d = await getCvData(ctx.workspace.id);
  const year = (s: string | null) => (s ? s.slice(0, 4) : "s.d.");
  const pf = (types: string[]) => d.portfolio.filter((i) => types.includes(i.item_type));

  // Organização segundo as seções do Currículo Lattes (CNPq) — dados vindos dos seus registros.
  const sections: { title: string; lattes: string; lines: string[] }[] = [
    { title: "Formação complementar", lattes: "Formação → Formação complementar", lines: d.certificates.filter((c) => c.certificate_type === "curso").map((c) => `${c.title}. ${c.hours ? `(Carga horária: ${formatNumber(Number(c.hours), 0)}h). ` : ""}${c.institution ?? ""}, ${year(c.issue_date)}.`) },
    { title: "Atuação profissional / estágios", lattes: "Atuação → Atuação profissional", lines: d.internships.map((i) => `${i.institution}${i.location ? ` — ${i.location}` : ""}. Estágio${i.area ? ` (${i.area.replace("_", " ")})` : ""}, ${year(i.start_date)}–${i.end_date ? year(i.end_date) : "atual"}.`) },
    { title: "Monitorias e extensão", lattes: "Atuação → Atividades de ensino / extensão universitária", lines: pf(["monitoria", "extensao"]).map((i) => `${i.title}${i.role ? `, ${i.role}` : ""}. ${i.institution ?? ""}, ${year(i.start_date)}.`) },
    { title: "Participação em eventos e congressos", lattes: "Eventos → Participação em eventos", lines: [...d.certificates.filter((c) => ["congresso", "evento", "palestra", "liga"].includes(c.certificate_type)).map((c) => `${c.title}. ${c.institution ?? ""}, ${year(c.issue_date)}.`), ...d.league.filter((l) => ["evento", "congresso"].includes(l.activity_type)).map((l) => `${l.title}, ${year(l.starts_at)}.`)] },
    { title: "Apresentações de trabalho", lattes: "Produção → Produção técnica → Apresentação de trabalho", lines: [...pf(["apresentacao"]).map((i) => `${i.title}. ${year(i.start_date)}.`), ...d.certificates.filter((c) => c.certificate_type === "apresentacao").map((c) => `${c.title}. ${c.institution ?? ""}, ${year(c.issue_date)}.`)] },
    { title: "Produção bibliográfica", lattes: "Produção → Produção bibliográfica", lines: [...pf(["publicacao"]).map((i) => `${i.title}. ${year(i.start_date)}.${i.url ? ` ${i.url}` : ""}`), ...d.projects.filter((p) => p.status === "concluido" && ["artigo_original", "revisao_sistematica", "revisao_integrativa", "resumo_cientifico"].includes(p.project_type)).map((p) => `${p.name}. ${year(p.due_date)}.`)] },
    { title: "Projetos de pesquisa", lattes: "Projetos → Projetos de pesquisa", lines: d.projects.filter((p) => ["projeto_cientifico", "projeto_pesquisa", "tcc"].includes(p.project_type)).map((p) => `${p.name}, ${year(p.start_date)}–${p.status === "concluido" ? year(p.due_date) : "atual"}.`) },
    { title: "Prêmios e títulos", lattes: "Dados gerais → Prêmios e títulos", lines: pf(["premio"]).map((i) => `${i.title}, ${i.institution ?? ""}, ${year(i.start_date)}.`) },
  ];

  return (
    <div className="space-y-5">
      <PageHeader title="Lattes" description="Seus registros organizados nas seções do Currículo Lattes, prontos para copiar e conferir." icon="IdCard"
        actions={ctx.profile?.lattes_url ? <a href={ctx.profile.lattes_url} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "outline" })}><ExternalLink /> Meu Lattes</a> : <Link href="/perfil" className={buttonVariants({ variant: "outline" })}>Cadastrar link do Lattes</Link>} />
      <Alert tone="info">A atualização do Lattes é feita na Plataforma Lattes (CNPq). Esta página não envia dados ao CNPq; ela organiza o que você já registrou. Revise datas, cargas horárias e autores antes de copiar.</Alert>
      <div className="grid gap-4 md:grid-cols-2">
        {sections.map((s) => (
          <Card key={s.title}>
            <CardHeader>
              <div><CardTitle>{s.title} ({s.lines.length})</CardTitle><CardDescription>No Lattes: {s.lattes}</CardDescription></div>
              {s.lines.length > 0 && <CopyTextButton text={s.lines.join("\n")} />}
            </CardHeader>
            <CardContent>
              {s.lines.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum registro.</p> : <ul className="list-disc space-y-1 pl-5 text-sm">{s.lines.map((l, i) => <li key={i}>{l}</li>)}</ul>}
            </CardContent>
          </Card>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Atualizado em {formatDate(new Date())}.</p>
    </div>
  );
}
