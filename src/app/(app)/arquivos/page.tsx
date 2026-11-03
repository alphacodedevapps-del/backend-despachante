import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { StatTile } from "@/components/dashboard/widgets";
import { NativeSelect } from "@/components/ui/input";
import { buttonVariants } from "@/components/ui/button";
import { requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { canWrite } from "@/lib/permissions";
import { formatBytes } from "@/lib/utils/format";
import { PROCESSING_LABELS } from "@/modules/documents/constants";
import { DocumentUploader } from "@/modules/documents/uploader";
import { DocumentList, type ListedDocument } from "@/modules/documents/document-list";

export const metadata: Metadata = { title: "Gerenciamento de arquivos" };

export default async function FilesPage({ searchParams }: { searchParams: Promise<{ status?: string; ordem?: string }> }) {
  const ctx = await requireSession();
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: all } = await supabase.from("documents").select("size_bytes, processing_status, upload_status").eq("workspace_id", ctx.workspace.id).limit(10000);
  const rows = (all ?? []) as { size_bytes: number; processing_status: string; upload_status: string }[];
  const sent = rows.filter((r) => r.upload_status === "enviado");
  const used = sent.reduce((s, r) => s + Number(r.size_bytes), 0);
  const indexed = sent.filter((r) => r.processing_status === "concluido").length;
  const failed = sent.filter((r) => r.processing_status === "falha").length;

  let q = supabase.from("documents").select("id, title, file_name, mime_type, size_bytes, category, processing_status, is_favorite, created_at, created_by").eq("workspace_id", ctx.workspace.id).eq("upload_status", "enviado").limit(300);
  if (sp.status && sp.status in PROCESSING_LABELS) q = q.eq("processing_status", sp.status);
  q = sp.ordem === "tamanho" ? q.order("size_bytes", { ascending: false }) : q.order("created_at", { ascending: false });
  const { data: docs } = await q;

  return (
    <div className="space-y-5">
      <PageHeader title="Gerenciamento de arquivos" description="Todos os arquivos do workspace, uso de armazenamento e status de indexação para a IA." icon="Files" actions={canWrite(ctx.workspace.role) ? <DocumentUploader /> : undefined} />
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Arquivos" value={sent.length} icon="Files" href="/arquivos" />
        <StatTile label="Armazenamento usado" value={formatBytes(used)} icon="Folder" href="/arquivos?ordem=tamanho" />
        <StatTile label="Indexados para a IA" value={indexed} icon="Sparkles" href="/arquivos?status=concluido" />
        <StatTile label="Com falha" value={failed} icon="ShieldCheck" href="/arquivos?status=falha" />
      </section>
      <form className="flex flex-wrap gap-2" action="/arquivos">
        <NativeSelect name="status" defaultValue={sp.status ?? ""} className="w-auto" aria-label="Status">
          <option value="">Todos os status</option>
          {Object.entries(PROCESSING_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </NativeSelect>
        <NativeSelect name="ordem" defaultValue={sp.ordem ?? ""} className="w-auto" aria-label="Ordenação">
          <option value="">Mais recentes</option>
          <option value="tamanho">Maiores primeiro</option>
        </NativeSelect>
        <button className={buttonVariants({ variant: "outline" })}>Aplicar</button>
      </form>
      <DocumentList docs={(docs ?? []) as ListedDocument[]} role={ctx.workspace.role} userId={ctx.user.id} />
      <p className="text-xs text-muted-foreground">Tipos permitidos: PDF, DOCX, PPTX, XLSX, PNG e JPG (até 50 MB). Arquivos ficam em armazenamento privado; links de acesso expiram em 5 minutos.</p>
    </div>
  );
}
