import Link from "next/link";
import { Paperclip } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { formatBytes } from "@/lib/utils/format";
import { ALLOWED_TYPES } from "./constants";
import { DocumentUploader } from "./uploader";
import { OpenFileButtons } from "./file-actions";
import { ProcessingBadge } from "./status-badge";

export interface DocRow {
  id: string;
  title: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  processing_status: string;
  upload_status: string;
  created_at: string;
}

/** Arquivos anexados a um registro (via entity_links com relação "anexo" ou qualquer relação com documentos). */
export async function AttachmentsPanel({ type, id, canWrite }: { type: string; id: string; canWrite: boolean }) {
  const supabase = await createClient();
  const { data: links } = await supabase
    .from("entity_links")
    .select("source_type, source_id, target_type, target_id")
    .or(`and(source_type.eq.${type},source_id.eq.${id},target_type.eq.documents),and(target_type.eq.${type},target_id.eq.${id},source_type.eq.documents)`);
  const ids = ((links ?? []) as { source_type: string; source_id: string; target_id: string }[]).map((l) => (l.source_type === "documents" ? l.source_id : l.target_id));
  const { data } = ids.length
    ? await supabase.from("documents").select("id, title, file_name, mime_type, size_bytes, processing_status, upload_status, created_at").in("id", ids).eq("upload_status", "enviado").order("created_at", { ascending: false })
    : { data: [] };
  const docs = (data ?? []) as DocRow[];

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2"><Paperclip className="size-4 text-primary" /> Arquivos</CardTitle>
          <CardDescription>PDFs, slides, imagens e documentos deste registro.</CardDescription>
        </div>
        {canWrite && <DocumentUploader attachTo={{ type, id }} label="Anexar" variant="outline" />}
      </CardHeader>
      <CardContent>
        {docs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum arquivo anexado.</p>
        ) : (
          <ul className="divide-y divide-border">
            {docs.map((d) => (
              <li key={d.id} className="flex flex-col gap-2 py-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <Link href={`/arquivos/${d.id}`} className="block truncate text-sm font-medium hover:text-primary">{d.title}</Link>
                  <p className="text-xs text-muted-foreground">{ALLOWED_TYPES[d.mime_type]?.label ?? d.mime_type} · {formatBytes(d.size_bytes)}</p>
                  <div className="mt-1"><ProcessingBadge status={d.processing_status} /></div>
                </div>
                <OpenFileButtons id={d.id} size="icon-sm" />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
