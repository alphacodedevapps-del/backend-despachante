import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/shared/page-header";
import { requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { ENTITY_MAP, optionLabel } from "@/modules/entities/definitions";
import { toneFor } from "@/modules/entities/components/field-value";

export const metadata: Metadata = { title: "Avaliação fisioterapêutica" };

export default async function AssessmentLibraryPage() {
  const ctx = await requireSession();
  const supabase = await createClient();
  const { data } = await supabase.from("clinical_tests").select("id, name, test_category, body_region, mastery_level").eq("workspace_id", ctx.workspace.id).order("name").limit(1000);
  const tests = (data ?? []) as { id: string; name: string; test_category: string; body_region: string | null; mastery_level: string }[];
  const catField = ENTITY_MAP.clinical_tests.fields.find((f) => f.name === "test_category")!;
  const regField = ENTITY_MAP.clinical_tests.fields.find((f) => f.name === "body_region")!;
  const masteryField = ENTITY_MAP.clinical_tests.fields.find((f) => f.name === "mastery_level")!;

  return (
    <div className="space-y-6">
      <PageHeader title="Avaliação fisioterapêutica" description="Biblioteca de testes, escalas e medidas organizada por categoria de avaliação." icon="ClipboardList"
        actions={<><Link href="/testes/novo" className={buttonVariants()}><Plus /> Novo teste ou escala</Link><Link href="/calculadoras" className={buttonVariants({ variant: "outline" })}>Calculadoras</Link></>} />
      <div className="grid gap-4 md:grid-cols-2">
        {(catField.options ?? []).map((c) => {
          const list = tests.filter((t) => t.test_category === c.value);
          return (
            <Card key={c.value}>
              <CardHeader>
                <CardTitle>{c.label} <span className="font-normal text-muted-foreground">({list.length})</span></CardTitle>
                <Link href={`/testes/novo?test_category=${c.value}&voltar=/avaliacao-fisioterapeutica`} className="text-xs text-primary hover:underline">Adicionar</Link>
              </CardHeader>
              <CardContent>
                {list.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum item cadastrado.</p> : (
                  <ul className="divide-y divide-border">
                    {list.slice(0, 12).map((t) => (
                      <li key={t.id} className="flex items-center justify-between gap-2 py-1.5 text-sm">
                        <Link href={`/testes/${t.id}`} className="truncate hover:text-primary">{t.name}</Link>
                        <span className="flex shrink-0 gap-1">{t.body_region && <Badge>{optionLabel(regField, t.body_region)}</Badge>}<Badge tone={toneFor(t.mastery_level)}>{optionLabel(masteryField, t.mastery_level)}</Badge></span>
                      </li>
                    ))}
                  </ul>
                )}
                {list.length > 12 && <Link href={`/testes?test_category=${c.value}`} className="mt-2 inline-block text-xs text-primary hover:underline">Ver todos</Link>}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
