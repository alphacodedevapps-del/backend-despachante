"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Download, Eye, Loader2, RefreshCw, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils/cn";
import { deleteDocumentAction, getDocumentUrlAction, reprocessDocumentAction, toggleDocumentFavoriteAction } from "./actions";

export function OpenFileButtons({ id, size = "sm" }: { id: string; size?: "sm" | "icon-sm" }) {
  const [pending, setPending] = React.useState<"view" | "dl" | null>(null);
  const open = async (download: boolean) => {
    setPending(download ? "dl" : "view");
    const res = await getDocumentUrlAction(id, download);
    setPending(null);
    if (!res.ok) return toast.error(res.error);
    if (download) window.location.href = res.data.url;
    else window.open(res.data.url, "_blank", "noopener,noreferrer");
  };
  return (
    <div className="flex gap-1">
      <Button variant="outline" size={size} onClick={() => open(false)} disabled={!!pending} aria-label="Visualizar">
        {pending === "view" ? <Loader2 className="animate-spin" /> : <Eye />} {size === "sm" && "Visualizar"}
      </Button>
      <Button variant="outline" size={size} onClick={() => open(true)} disabled={!!pending} aria-label="Baixar">
        {pending === "dl" ? <Loader2 className="animate-spin" /> : <Download />} {size === "sm" && "Baixar"}
      </Button>
    </div>
  );
}

export function ReprocessButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await reprocessDocumentAction(id);
          if (!res.ok) toast.error(res.error);
          else {
            toast.success("Reprocessamento iniciado.");
            router.refresh();
          }
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" /> : <RefreshCw />} Reprocessar
    </Button>
  );
}

export function DeleteDocumentButton({ id, title, redirectTo, iconOnly }: { id: string; title: string; redirectTo?: string; iconOnly?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, start] = React.useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {iconOnly ? (
          <Button variant="danger-ghost" size="icon-sm" aria-label={`Excluir ${title}`}><Trash2 /></Button>
        ) : (
          <Button variant="danger-ghost" size="sm"><Trash2 /> Excluir</Button>
        )}
      </DialogTrigger>
      <DialogContent title="Excluir arquivo" description={`"${title}" será removido do armazenamento, junto com os trechos indexados para a IA. Esta ação não pode ser desfeita.`}>
        <div className="flex justify-end gap-2">
          <DialogClose asChild><Button variant="outline">Cancelar</Button></DialogClose>
          <Button
            variant="danger"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await deleteDocumentAction(id);
                if (!res.ok) return void toast.error(res.error);
                toast.success("Arquivo excluído.");
                setOpen(false);
                if (redirectTo) router.push(redirectTo);
                router.refresh();
              })
            }
          >
            {pending && <Loader2 className="animate-spin" />} Excluir
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function DocumentFavorite({ id, value, disabled }: { id: string; value: boolean; disabled?: boolean }) {
  const [fav, setFav] = React.useState(value);
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      disabled={disabled}
      aria-pressed={fav}
      aria-label={fav ? "Remover dos favoritos" : "Favoritar"}
      onClick={async () => {
        setFav(!fav);
        const res = await toggleDocumentFavoriteAction(id, !fav);
        if (!res.ok) {
          setFav(fav);
          toast.error(res.error);
        }
      }}
    >
      <Star className={cn(fav && "fill-current text-warning")} />
    </Button>
  );
}
