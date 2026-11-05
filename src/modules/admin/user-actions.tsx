"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ban, CalendarPlus, Loader2, MoreHorizontal, NotebookPen, Unlock, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { grantDaysAction, registerManualPaymentAction, setBlockedAction, setNoteAction } from "./actions";

export function UserActions({ userId, email, blocked, note, priceCents, isAdmin }: { userId: string; email: string; blocked: boolean; note: string | null; priceCents: number; isAdmin: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>, msg: string) => {
    setBusy(true);
    const r = await fn();
    setBusy(false);
    if (!r.ok) toast.error(r.error ?? "Erro.");
    else {
      toast.success(msg);
      router.refresh();
    }
  };
  if (isAdmin) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Ações para ${email}`} disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <MoreHorizontal />}</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-60">
        {blocked ? (
          <DropdownMenuItem onSelect={() => run(() => setBlockedAction(userId, false, null), "Acesso desbloqueado.")}><Unlock /> Desbloquear</DropdownMenuItem>
        ) : (
          <DropdownMenuItem onSelect={() => { const reason = prompt(`Motivo do bloqueio de ${email}:`, "Falta de pagamento"); if (reason !== null) void run(() => setBlockedAction(userId, true, reason), "Usuário bloqueado."); }}><Ban /> Bloquear</DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={() => { const d = prompt("Quantos dias de acesso conceder?", "30"); const n = Number(d); if (d !== null && Number.isInteger(n) && n > 0) void run(() => grantDaysAction(userId, n), `${n} dia(s) concedido(s).`); }}><CalendarPlus /> Conceder dias</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => { if (confirm(`Registrar pagamento manual de R$ ${(priceCents / 100).toFixed(2).replace(".", ",")} para ${email} e liberar 30 dias?`)) void run(() => registerManualPaymentAction(userId, priceCents), "Pagamento registrado e acesso liberado."); }}><Wallet /> Registrar pagamento manual</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => { const n = prompt("Observação interna:", note ?? ""); if (n !== null) void run(() => setNoteAction(userId, n), "Observação salva."); }}><NotebookPen /> Observação</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
