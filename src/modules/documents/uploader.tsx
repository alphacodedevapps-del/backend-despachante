"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Loader2, Upload, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Input, Label, NativeSelect } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { formatBytes } from "@/lib/utils/format";
import { ACCEPT_ATTR, DOCUMENT_CATEGORIES, MAX_UPLOAD_BYTES, resolveMime } from "./constants";
import { uploadDocument } from "./upload-client";

interface Item {
  file: File;
  title: string;
  progress: number;
  status: "pendente" | "enviando" | "concluido" | "erro";
  error?: string;
}

export function DocumentUploader({ attachTo, folderId, subjectId, folders, subjects, label = "Enviar arquivos", variant = "default" }: {
  attachTo?: { type: string; id: string };
  folderId?: string | null;
  subjectId?: string | null;
  folders?: { id: string; label: string }[];
  subjects?: { id: string; label: string }[];
  label?: string;
  variant?: "default" | "outline";
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [items, setItems] = React.useState<Item[]>([]);
  const [category, setCategory] = React.useState("material");
  const [folder, setFolder] = React.useState(folderId ?? "");
  const [subject, setSubject] = React.useState(subjectId ?? "");
  const [busy, setBusy] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const addFiles = (files: FileList | null) => {
    if (!files) return;
    const next: Item[] = [];
    for (const file of Array.from(files)) {
      const mime = resolveMime(file.name, file.type);
      if (!mime) {
        toast.error(`${file.name}: tipo não permitido.`);
        continue;
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        toast.error(`${file.name}: maior que ${formatBytes(MAX_UPLOAD_BYTES)}.`);
        continue;
      }
      next.push({ file, title: file.name.replace(/\.[^.]+$/, ""), progress: 0, status: "pendente" });
    }
    setItems((prev) => [...prev, ...next].slice(0, 20));
  };

  const update = (idx: number, patch: Partial<Item>) => setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));

  const upload = async () => {
    setBusy(true);
    let ok = 0;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.status === "concluido") continue;
      update(i, { status: "enviando", progress: 0, error: undefined });
      try {
        await uploadDocument(
          it.file,
          { title: it.title.trim() || it.file.name, category, folderId: folder || null, subjectId: subject || null, attachTo: attachTo ?? null },
          (p) => update(i, { progress: p }),
        );
        update(i, { status: "concluido", progress: 100 });
        ok++;
      } catch (e) {
        update(i, { status: "erro", error: (e as Error).message });
      }
    }
    setBusy(false);
    if (ok) {
      toast.success(`${ok} arquivo(s) enviado(s). A indexação para a IA ocorre em segundo plano.`);
      router.refresh();
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (busy) return;
        setOpen(o);
        if (!o) setItems([]);
      }}
    >
      <DialogTrigger asChild>
        <Button variant={variant} size={variant === "outline" ? "sm" : "default"}>
          <Upload /> {label}
        </Button>
      </DialogTrigger>
      <DialogContent title="Enviar arquivos" description="PDF, DOCX, PPTX, XLSX, PNG ou JPG — até 50 MB cada. Os arquivos ficam em armazenamento privado." wide>
        <div
          className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border p-6 text-center hover:bg-surface-muted"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            addFiles(e.dataTransfer.files);
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
        >
          <Upload className="size-6 text-muted-foreground" />
          <p className="text-sm font-medium">Arraste arquivos ou toque para selecionar</p>
          <p className="text-xs text-muted-foreground">No celular, você pode escolher da câmera ou dos arquivos.</p>
          <input ref={inputRef} type="file" multiple accept={ACCEPT_ATTR} className="hidden" onChange={(e) => addFiles(e.target.files)} />
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="up-cat">Categoria</Label>
            <NativeSelect id="up-cat" value={category} onChange={(e) => setCategory(e.target.value)}>
              {DOCUMENT_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </NativeSelect>
          </div>
          {folders && (
            <div className="space-y-1.5">
              <Label htmlFor="up-folder">Pasta</Label>
              <NativeSelect id="up-folder" value={folder} onChange={(e) => setFolder(e.target.value)}>
                <option value="">— Sem pasta —</option>
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>{f.label}</option>
                ))}
              </NativeSelect>
            </div>
          )}
          {subjects && (
            <div className="space-y-1.5">
              <Label htmlFor="up-subject">Disciplina</Label>
              <NativeSelect id="up-subject" value={subject} onChange={(e) => setSubject(e.target.value)}>
                <option value="">— Nenhuma —</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </NativeSelect>
            </div>
          )}
        </div>

        {items.length > 0 && (
          <ul className="mt-4 space-y-3">
            {items.map((it, i) => (
              <li key={`${it.file.name}-${i}`} className="rounded-md border border-border p-3">
                <div className="flex items-center gap-2">
                  <Input value={it.title} disabled={it.status !== "pendente" && it.status !== "erro"} onChange={(e) => update(i, { title: e.target.value })} aria-label="Título do documento" />
                  {it.status === "concluido" && <CheckCircle2 className="size-5 shrink-0 text-success" />}
                  {it.status === "erro" && <XCircle className="size-5 shrink-0 text-danger" />}
                  {it.status === "enviando" && <Loader2 className="size-5 shrink-0 animate-spin text-primary" />}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{it.file.name} · {formatBytes(it.file.size)}</p>
                {it.status === "enviando" && <Progress value={it.progress} className="mt-2" label={`Enviando ${it.file.name}`} />}
                {it.error && <p className="mt-1 text-xs text-danger">{it.error}</p>}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>Fechar</Button>
          <Button disabled={busy || !items.some((i) => i.status === "pendente" || i.status === "erro")} onClick={upload}>
            {busy && <Loader2 className="animate-spin" />} Enviar {items.length ? `(${items.length})` : ""}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
