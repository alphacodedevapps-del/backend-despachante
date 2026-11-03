import Link from "next/link";
import { FileText, ImageIcon } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { formatBytes, formatDate } from "@/lib/utils/format";
import { canEditRow, type WorkspaceRole } from "@/lib/permissions";
import { ALLOWED_TYPES, DOCUMENT_CATEGORIES } from "./constants";
import { DeleteDocumentButton, DocumentFavorite, OpenFileButtons } from "./file-actions";
import { ProcessingBadge } from "./status-badge";

export interface ListedDocument {
  id: string;
  title: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  category: string;
  processing_status: string;
  is_favorite: boolean;
  created_at: string;
  created_by: string | null;
}

export function DocumentList({ docs, role, userId }: { docs: ListedDocument[]; role: WorkspaceRole; userId: string }) {
  if (docs.length === 0) return <EmptyState icon="Files" title="Nenhum arquivo aqui" description="Envie PDFs, slides, imagens e documentos." />;
  return (
    <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
      {docs.map((d) => {
        const editable = canEditRow(role, d.created_by, userId);
        const Icon = d.mime_type.startsWith("image/") ? ImageIcon : FileText;
        return (
          <li key={d.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary"><Icon className="size-4" /></span>
              <div className="min-w-0">
                <Link href={`/arquivos/${d.id}`} className="block truncate text-sm font-medium hover:text-primary">{d.title}</Link>
                <p className="truncate text-xs text-muted-foreground">
                  {ALLOWED_TYPES[d.mime_type]?.label ?? d.mime_type} · {formatBytes(d.size_bytes)} · {DOCUMENT_CATEGORIES.find((c) => c.value === d.category)?.label} · {formatDate(d.created_at)}
                </p>
                <div className="mt-1"><ProcessingBadge status={d.processing_status} /></div>
              </div>
            </div>
            <div className="flex items-center gap-1 self-end sm:self-auto">
              <DocumentFavorite id={d.id} value={d.is_favorite} disabled={!editable} />
              <OpenFileButtons id={d.id} size="icon-sm" />
              {editable && <DeleteDocumentButton id={d.id} title={d.title} iconOnly />}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
