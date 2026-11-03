"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, NativeSelect, Textarea } from "@/components/ui/input";
import { TagInput } from "@/modules/entities/components/field-inputs";
import { DOCUMENT_CATEGORIES } from "./constants";
import { updateDocumentAction } from "./actions";

export function DocumentEditForm({ doc, folders, subjects }: {
  doc: { id: string; title: string; description: string | null; category: string; folder_id: string | null; subject_id: string | null; tags: string[] };
  folders: { id: string; name: string }[];
  subjects: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [v, setV] = React.useState({ ...doc, description: doc.description ?? "", folder_id: doc.folder_id ?? "", subject_id: doc.subject_id ?? "" });
  const [busy, setBusy] = React.useState(false);
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const res = await updateDocumentAction(doc.id, { title: v.title, description: v.description, category: v.category, folder_id: v.folder_id || null, subject_id: v.subject_id || null, tags: v.tags });
        setBusy(false);
        if (!res.ok) toast.error(res.error);
        else {
          toast.success("Arquivo atualizado.");
          router.refresh();
        }
      }}
    >
      <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="d-title">Título</Label><Input id="d-title" value={v.title} maxLength={300} onChange={(e) => setV({ ...v, title: e.target.value })} required /></div>
      <div className="space-y-1.5"><Label htmlFor="d-cat">Categoria</Label><NativeSelect id="d-cat" value={v.category} onChange={(e) => setV({ ...v, category: e.target.value })}>{DOCUMENT_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</NativeSelect></div>
      <div className="space-y-1.5"><Label htmlFor="d-folder">Pasta</Label><NativeSelect id="d-folder" value={v.folder_id} onChange={(e) => setV({ ...v, folder_id: e.target.value })}><option value="">— Sem pasta —</option>{folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</NativeSelect></div>
      <div className="space-y-1.5"><Label htmlFor="d-subject">Disciplina</Label><NativeSelect id="d-subject" value={v.subject_id} onChange={(e) => setV({ ...v, subject_id: e.target.value })}><option value="">— Nenhuma —</option>{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</NativeSelect></div>
      <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="d-desc">Descrição</Label><Textarea id="d-desc" value={v.description} maxLength={5000} onChange={(e) => setV({ ...v, description: e.target.value })} /></div>
      <div className="space-y-1.5 sm:col-span-2"><Label>Tags</Label><TagInput value={v.tags} onChange={(tags) => setV({ ...v, tags })} /></div>
      <div className="sm:col-span-2"><Button type="submit" disabled={busy}>{busy && <Loader2 className="animate-spin" />} Salvar</Button></div>
    </form>
  );
}
