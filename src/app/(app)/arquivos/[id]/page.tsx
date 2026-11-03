import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Sparkles } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/shared/page-header";
import { requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { canEditRow, canWrite } from "@/lib/permissions";
import { formatBytes, formatDateTime } from "@/lib/utils/format";
import { ALLOWED_TYPES, DOCUMENT_CATEGORIES } from "@/modules/documents/constants";
import { DeleteDocumentButton, OpenFileButtons, ReprocessButton } from "@/modules/documents/file-actions";
import { ProcessingBadge } from "@/modules/documents/status-badge";
import { DocumentEditForm } from "@/modules/documents/edit-form";
import { getLinkedItems } from "@/modules/relations/queries";
import { RelatedContent } from "@/modules/relations/related-content";
import { suggestRelationsAction } from "@/modules/assistant/actions";
import { publicAiStatus } from "@/lib/ai/config";

export const metadata: Metadata = { title: "Arquivo" };

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireSession();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const { data: doc } = await supabase.from("documents").select("*").eq("id", id).maybeSingle();
  if (!doc) notFound();
  const ws = ctx.workspaces.find((w) => w.id === doc.workspace_id);
  const editable = canEditRow(ws?.role, doc.created_by, ctx.user.id);
  const [{ data: signed }, { data: jobs }, { data: folders }, { data: subjects }, linked] = await Promise.all([
    doc.upload_status === "enviado" ? supabase.storage.from("documents").createSignedUrl(doc.storage_path, 600) : Promise.resolve({ data: null }),
    supabase.from("document_processing_jobs").select("status, attempt, error, started_at, finished_at, stats").eq("document_id", id).order("created_at", { ascending: false }).limit(5),
    supabase.from("library_folders").select("id, name").eq("workspace_id", doc.workspace_id).order("name"),
    supabase.from("subjects").select("id, name").eq("workspace_id", doc.workspace_id).order("name"),
    getLinkedItems("documents", id),
  ]);
  const previewUrl = signed?.signedUrl ?? null;
  const isPdf = doc.mime_type === "application/pdf";
  const isImage = String(doc.mime_type).startsWith("image/");

  return (
    <div>
      <PageHeader
        title={doc.title}
        description={`${ALLOWED_TYPES[doc.mime_type]?.label ?? doc.mime_type} · ${formatBytes(doc.size_bytes)} · ${DOCUMENT_CATEGORIES.find((c) => c.value === doc.category)?.label ?? doc.category}`}
        icon="Files"
        breadcrumbs={[{ label: "Arquivos", href: "/arquivos" }, { label: doc.title }]}
        actions={
          <>
            <OpenFileButtons id={id} />
            {doc.processing_status === "concluido" && <Link href={`/assistente?contexto=documents:${id}`} className={buttonVariants({ variant: "outline" })}><Sparkles /> Perguntar à IA</Link>}
            {editable && <DeleteDocumentButton id={id} title={doc.title} redirectTo="/arquivos" />}
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader><CardTitle>Pré-visualização</CardTitle></CardHeader>
            <CardContent>
              {previewUrl && isPdf && <iframe src={previewUrl} title={`Pré-visualização de ${doc.title}`} className="h-[70vh] w-full rounded-md border border-border bg-white" />}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {previewUrl && isImage && <img src={previewUrl} alt={doc.title} className="max-h-[70vh] w-auto rounded-md border border-border" />}
              {(!previewUrl || (!isPdf && !isImage)) && <p className="text-sm text-muted-foreground">Pré-visualização não disponível para este tipo. Use “Visualizar” ou “Baixar”.</p>}
            </CardContent>
          </Card>
          {editable && (
            <Card>
              <CardHeader><CardTitle>Informações</CardTitle></CardHeader>
              <CardContent>
                <DocumentEditForm doc={{ id, title: doc.title, description: doc.description, category: doc.category, folder_id: doc.folder_id, subject_id: doc.subject_id, tags: doc.tags ?? [] }} folders={(folders ?? []) as { id: string; name: string }[]} subjects={(subjects ?? []) as { id: string; name: string }[]} />
              </CardContent>
            </Card>
          )}
        </div>
        <aside className="space-y-6">
          <Card>
            <CardHeader>
              <div><CardTitle>Indexação para a IA</CardTitle><CardDescription>O documento só é pesquisável pela IA após a conclusão.</CardDescription></div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <ProcessingBadge status={doc.processing_status} />
              {doc.processing_error && <Alert tone="danger">{doc.processing_error}</Alert>}
              <p className="text-muted-foreground">{doc.chunk_count} trecho(s){doc.page_count ? ` · ${doc.page_count} página(s)` : ""}{doc.indexed_at ? ` · indexado em ${formatDateTime(doc.indexed_at)}` : ""}</p>
              {editable && doc.upload_status === "enviado" && <ReprocessButton id={id} />}
              {(jobs ?? []).length > 0 && (
                <ul className="space-y-1 text-xs text-muted-foreground">
                  {((jobs ?? []) as { status: string; attempt: number; started_at: string | null; error: string | null }[]).map((j, i) => (
                    <li key={i}>Tentativa {j.attempt}: {j.status}{j.started_at ? ` · ${formatDateTime(j.started_at)}` : ""}{j.error ? ` — ${j.error}` : ""}</li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <RelatedContent type="documents" id={id} items={linked} canEdit={canWrite(ws?.role)} suggest={suggestRelationsAction} aiAvailable={publicAiStatus().chatConfigured} />
          <Card><CardContent className="space-y-1 pt-5 text-xs text-muted-foreground"><p>Arquivo: {doc.file_name}</p><p>Enviado em {formatDateTime(doc.created_at)}</p><p>Workspace: {ws?.name}</p></CardContent></Card>
        </aside>
      </div>
    </div>
  );
}
