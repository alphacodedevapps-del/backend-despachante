import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/input";
import { requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { ReviewSession, type ReviewCard } from "@/modules/studies/review-session";

export const metadata: Metadata = { title: "Revisão de flashcards" };

export default async function ReviewPage({ searchParams }: { searchParams: Promise<{ disciplina?: string; assunto?: string }> }) {
  const ctx = await requireSession();
  const sp = await searchParams;
  const supabase = await createClient();
  let q = supabase
    .from("flashcards")
    .select("id, front, back, topic, subject_id, subjects(name)")
    .eq("workspace_id", ctx.workspace.id)
    .lte("next_review_at", new Date().toISOString())
    .order("next_review_at")
    .limit(100);
  if (sp.disciplina && /^[0-9a-f-]{36}$/i.test(sp.disciplina)) q = q.eq("subject_id", sp.disciplina);
  if (sp.assunto) q = q.ilike("topic", `%${sp.assunto.replace(/[%_]/g, "").slice(0, 100)}%`);
  const [{ data }, { data: subjects }] = await Promise.all([q, supabase.from("subjects").select("id, name").eq("workspace_id", ctx.workspace.id).order("name")]);
  type R = { id: string; front: string; back: string; topic: string | null; subjects: { name: string } | { name: string }[] | null };
  const cards: ReviewCard[] = ((data ?? []) as unknown as R[]).map((c) => ({ id: c.id, front: c.front, back: c.back, topic: c.topic, subject: (Array.isArray(c.subjects) ? c.subjects[0]?.name : c.subjects?.name) ?? null }));

  return (
    <div>
      <PageHeader title="Revisão espaçada" description="Avalie cada cartão; o intervalo da próxima revisão é calculado pelo algoritmo configurável (Configurações → Estudos)." icon="Layers" breadcrumbs={[{ label: "Flashcards", href: "/flashcards" }, { label: "Revisão" }]} />
      <form className="mb-6 flex flex-wrap gap-2" action="/revisao-flashcards">
        <NativeSelect name="disciplina" defaultValue={sp.disciplina ?? ""} className="w-auto" aria-label="Disciplina">
          <option value="">Todas as disciplinas</option>
          {((subjects ?? []) as { id: string; name: string }[]).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </NativeSelect>
        <input name="assunto" defaultValue={sp.assunto ?? ""} placeholder="Assunto" className="h-9 rounded-md border border-input bg-surface px-3 text-sm" aria-label="Assunto" />
        <button className={buttonVariants({ variant: "outline" })}>Filtrar</button>
      </form>
      {cards.length === 0 ? (
        <EmptyState icon="Layers" title="Nenhum cartão para revisar agora" description="Todos os cartões estão em dia. Crie novos flashcards ou volte mais tarde." action={<Link href="/flashcards/novo" className={buttonVariants()}>Novo flashcard</Link>} />
      ) : (
        <ReviewSession cards={cards} />
      )}
    </div>
  );
}
