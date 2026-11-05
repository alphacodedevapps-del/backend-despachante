"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, CheckCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteNotificationAction, markNotificationReadAction } from "./actions";

export function MarkReadButton({ id }: { id: string | null }) {
  const router = useRouter();
  return (
    <Button variant={id ? "ghost" : "outline"} size={id ? "icon-sm" : "default"} aria-label={id ? "Marcar como lida" : undefined} onClick={async () => {
      const r = await markNotificationReadAction(id);
      if (!r.ok) toast.error(r.error);
      else router.refresh();
    }}>{id ? <Check /> : <><CheckCheck /> Marcar todas como lidas</>}</Button>
  );
}

export function DeleteNotificationButton({ id }: { id: string }) {
  const router = useRouter();
  return <Button variant="ghost" size="icon-sm" aria-label="Excluir notificação" onClick={async () => { const r = await deleteNotificationAction(id); if (!r.ok) toast.error(r.error); else router.refresh(); }}><X /></Button>;
}
