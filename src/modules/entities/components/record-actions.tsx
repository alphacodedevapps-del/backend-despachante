"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils/cn";
import { deleteRecordAction, patchRecordAction } from "../actions";

export function DeleteRecordButton({ entityKey, id, label, redirectTo, iconOnly }: {
  entityKey: string;
  id: string;
  label: string;
  redirectTo?: string;
  iconOnly?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {iconOnly ? (
          <Button variant="danger-ghost" size="icon-sm" aria-label={`Excluir ${label}`}>
            <Trash2 />
          </Button>
        ) : (
          <Button variant="danger-ghost">
            <Trash2 /> Excluir
          </Button>
        )}
      </DialogTrigger>
      <DialogContent title="Confirmar exclusão" description={`"${label}" será excluído(a) permanentemente, junto com seus relacionamentos. Esta ação não pode ser desfeita.`}>
        <div className="flex justify-end gap-2">
          <DialogClose asChild>
            <Button variant="outline">Cancelar</Button>
          </DialogClose>
          <Button
            variant="danger"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const res = await deleteRecordAction(entityKey, id);
                if (!res.ok) {
                  toast.error(res.error);
                  return;
                }
                toast.success("Registro excluído.");
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

export function FavoriteButton({ entityKey, id, value, disabled }: { entityKey: string; id: string; value: boolean; disabled?: boolean }) {
  const router = useRouter();
  const [fav, setFav] = React.useState(value);
  const [pending, startTransition] = React.useTransition();
  return (
    <Tooltip content={fav ? "Remover dos favoritos" : "Adicionar aos favoritos"}>
      <Button
        variant="ghost"
        size="icon-sm"
        disabled={pending || disabled}
        aria-pressed={fav}
        aria-label={fav ? "Remover dos favoritos" : "Adicionar aos favoritos"}
        onClick={() =>
          startTransition(async () => {
            const next = !fav;
            setFav(next);
            const res = await patchRecordAction(entityKey, id, { is_favorite: next });
            if (!res.ok) {
              setFav(!next);
              toast.error(res.error);
            } else router.refresh();
          })
        }
      >
        <Star className={cn(fav && "fill-current text-warning")} />
      </Button>
    </Tooltip>
  );
}

/** Seletor rápido de status (ou qualquer campo select) inline. */
export function InlineSelect({ entityKey, id, field, value, options, disabled }: {
  entityKey: string;
  id: string;
  field: string;
  value: string;
  options: { value: string; label: string }[];
  disabled?: boolean;
}) {
  const router = useRouter();
  const [current, setCurrent] = React.useState(value);
  const [pending, startTransition] = React.useTransition();
  return (
    <select
      aria-label="Alterar status"
      disabled={disabled || pending}
      value={current}
      className="h-8 rounded-md border border-input bg-surface px-2 text-xs"
      onChange={(e) => {
        const next = e.target.value;
        const prev = current;
        setCurrent(next);
        startTransition(async () => {
          const res = await patchRecordAction(entityKey, id, { [field]: next });
          if (!res.ok) {
            setCurrent(prev);
            toast.error(res.error);
          } else {
            toast.success("Atualizado.");
            router.refresh();
          }
        });
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}
