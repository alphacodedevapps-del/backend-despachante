import type * as React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Folder, FolderOpen, FolderPlus, Search } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/input";
import { PageHeader } from "@/components/shared/page-header";
import { requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { canWrite } from "@/lib/permissions";
import { cn } from "@/lib/utils/cn";
import { DOCUMENT_CATEGORIES } from "@/modules/documents/constants";
import { DocumentUploader } from "@/modules/documents/uploader";
import { DocumentList, type ListedDocument } from "@/modules/documents/document-list";

export const metadata: Metadata = { title: "Biblioteca acadêmica" };

const UUID = /^[0-9a-f-]{36}$/i;

export default async function LibraryPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requireSession();
  const sp = await searchParams;
  const supabase = await createClient();
  const ws = ctx.workspace.id;
  const folderId = sp.pasta && UUID.test(sp.pasta) ? sp.pasta : null;
  const subjectId = sp.disciplina && UUID.test(sp.disciplina) ? sp.disciplina : null;
  const category = DOCUMENT_CATEGORIES.some((c) => c.value === sp.categoria) ? sp.categoria : null;

  const [{ data: folders }, { data: subjects }] = await Promise.all([
    supabase.from("library_folders").select("id, name, parent_id, subject_id").eq("workspace_id", ws).order("name"),
    supabase.from("subjects").select("id, name").eq("workspace_id", ws).order("name"),
  ]);
  const F = (folders ?? []) as { id: string; name: string; parent_id: string | null }[];
  const S = (subjects ?? []) as { id: string; name: string }[];

  let q = supabase.from("documents").select("id, title, file_name, mime_type, size_bytes, category, processing_status, is_favorite, created_at, created_by").eq("workspace_id", ws).eq("upload_status", "enviado").order("created_at", { ascending: false }).limit(200);
  if (folderId) q = q.eq("folder_id", folderId);
  else if (!subjectId && !category && !sp.q && sp.fav !== "1") q = q.is("folder_id", null);
  if (subjectId) q = q.eq("subject_id", subjectId);
  if (category) q = q.eq("category", category);
  if (sp.fav === "1") q = q.eq("is_favorite", true);
  if (sp.q && sp.q.trim().length >= 2) {
    const { data: hits } = await supabase.rpc("global_search", { p_query: sp.q.slice(0, 200), p_workspace_id: ws, p_types: ["documents"], p_limit: 200 });
    q = q.in("id", ((hits ?? []) as { entity_id: string }[]).map((h) => h.entity_id).concat("00000000-0000-0000-0000-000000000000"));
  }
  const { data: docs } = await q;

  const children = (parent: string | null) => F.filter((f) => f.parent_id === parent);
  const current = folderId ? F.find((f) => f.id === folderId) : null;
  const trail: { id: string; name: string }[] = [];
  for (let c = current; c; c = c.parent_id ? F.find((f) => f.id === c!.parent_id) : undefined) trail.unshift(c);

  const renderTree = (parent: string | null, depth: number): React.ReactNode =>
    children(parent).map((f) => (
      <li key={f.id}>
        <Link href={`/biblioteca?pasta=${f.id}`} className={cn("flex items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-surface-muted", folderId === f.id && "bg-primary-soft text-primary")} style={{ paddingLeft: 8 + depth * 14 }}>
          {folderId === f.id ? <FolderOpen className="size-4 shrink-0" /> : <Folder className="size-4 shrink-0" />} <span className="truncate">{f.name}</span>
        </Link>
        {children(f.id).length > 0 && <ul>{renderTree(f.id, depth + 1)}</ul>}
      </li>
    ));

  const writable = canWrite(ctx.workspace.role);
  return (
    <div>
      <PageHeader
        title="Biblioteca acadêmica"
        description="Pastas, materiais de aula, slides, PDFs, imagens e documentos por disciplina."
        icon="Library"
        breadcrumbs={[{ label: "Biblioteca", href: "/biblioteca" }, ...trail.map((t) => ({ label: t.name, href: `/biblioteca?pasta=${t.id}` }))]}
        actions={
          writable ? (
            <>
              <Link href={`/pastas/novo${folderId ? `?parent_id=${folderId}&voltar=/biblioteca?pasta=${folderId}` : "?voltar=/biblioteca"}`} className={buttonVariants({ variant: "outline" })}><FolderPlus /> Nova pasta</Link>
              <DocumentUploader folderId={folderId} subjectId={subjectId} folders={F.map((f) => ({ id: f.id, label: f.name }))} subjects={S.map((s) => ({ id: s.id, label: s.name }))} />
            </>
          ) : undefined
        }
      />
      <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="order-2 space-y-4 lg:order-none">
          <nav aria-label="Pastas" className="rounded-lg border border-border bg-surface p-2">
            <Link href="/biblioteca" className={cn("flex items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-surface-muted", !folderId && !subjectId && !category && "bg-primary-soft text-primary")}><Folder className="size-4" /> Raiz</Link>
            <ul className="mt-1">{renderTree(null, 0)}</ul>
            {F.length === 0 && <p className="px-2 py-1 text-xs text-muted-foreground">Nenhuma pasta.</p>}
          </nav>
          <div className="space-y-1 text-sm">
            <p className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Atalhos</p>
            <Link href="/disciplinas" className="block rounded px-1 py-0.5 hover:text-primary">Disciplinas</Link>
            <Link href="/semestres" className="block rounded px-1 py-0.5 hover:text-primary">Semestres</Link>
            <Link href="/professores" className="block rounded px-1 py-0.5 hover:text-primary">Professores</Link>
            <Link href="/caderno" className="block rounded px-1 py-0.5 hover:text-primary">Anotações e resumos</Link>
            {folderId && <Link href={`/pastas/${folderId}`} className="block rounded px-1 py-0.5 hover:text-primary">Detalhes da pasta</Link>}
          </div>
        </aside>
        <div className="min-w-0 space-y-4">
          <form className="flex flex-col gap-2 sm:flex-row" action="/biblioteca">
            {folderId && <input type="hidden" name="pasta" value={folderId} />}
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input name="q" defaultValue={sp.q ?? ""} placeholder="Pesquisar arquivos…" className="h-9 w-full rounded-md border border-input bg-surface pl-9 pr-3 text-sm" aria-label="Pesquisar arquivos" />
            </div>
            <NativeSelect name="disciplina" defaultValue={subjectId ?? ""} className="sm:w-48" aria-label="Disciplina">
              <option value="">Todas as disciplinas</option>
              {S.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </NativeSelect>
            <NativeSelect name="categoria" defaultValue={category ?? ""} className="sm:w-44" aria-label="Categoria">
              <option value="">Todas as categorias</option>
              {DOCUMENT_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </NativeSelect>
            <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" name="fav" value="1" defaultChecked={sp.fav === "1"} className="accent-[var(--primary)]" /> Favoritos</label>
            <button className={buttonVariants({ variant: "outline" })}>Filtrar</button>
          </form>
          {folderId && children(folderId).length > 0 && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {children(folderId).map((f) => (
                <Link key={f.id} href={`/biblioteca?pasta=${f.id}`} className="flex items-center gap-2 rounded-lg border border-border bg-surface p-3 text-sm hover:border-primary/40"><Folder className="size-4 text-primary" /> <span className="truncate">{f.name}</span></Link>
              ))}
            </div>
          )}
          <DocumentList docs={(docs ?? []) as ListedDocument[]} role={ctx.workspace.role} userId={ctx.user.id} />
        </div>
      </div>
    </div>
  );
}
