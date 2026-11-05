"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Loader2, Lock, RefreshCw, ShieldCheck } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { startCheckoutAction, refreshMyPaymentsAction, myAccessStatusAction } from "./actions";

export function formatBRL(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

export function PayButton({ priceCents, label, size = "lg" }: { priceCents: number; label?: string; size?: "lg" | "default" }) {
  const [busy, setBusy] = React.useState(false);
  return (
    <Button
      size={size}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const res = await startCheckoutAction();
        if (!res.ok) {
          setBusy(false);
          return void toast.error(res.error);
        }
        window.location.href = res.data.payUrl;
      }}
    >
      {busy ? <Loader2 className="animate-spin" /> : <ShieldCheck />} {label ?? `Pagar ${formatBRL(priceCents)} com PagBank`}
    </Button>
  );
}

/** Popup que bloqueia o conteúdo quando o teste ou o período pago termina. */
export function Paywall({ status, priceCents }: { status: string; priceCents: number }) {
  const blocked = status === "bloqueado";
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="paywall-title">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 text-center shadow-pop">
        <span className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-primary-soft text-primary"><Lock className="size-6" /></span>
        <h2 id="paywall-title" className="text-lg font-semibold">
          {blocked ? "Acesso suspenso" : status === "vencido" ? "Seu acesso terminou" : "Assine para continuar"}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {blocked
            ? "Seu acesso foi suspenso pelo administrador. Regularize o pagamento para liberar novamente."
            : "O período de teste grátis (ou o período pago) acabou. Para continuar acessando seus materiais, faça o pagamento mensal."}
        </p>
        <p className="mt-4 text-3xl font-semibold tabular-nums">{formatBRL(priceCents)}<span className="text-sm font-normal text-muted-foreground"> / 30 dias</span></p>
        <ul className="mx-auto mt-3 max-w-xs space-y-1 text-left text-sm text-muted-foreground">
          {["Acesso completo por 30 dias", "Pix, cartão de crédito, débito ou boleto", "Seus dados continuam salvos"].map((t) => (
            <li key={t} className="flex items-center gap-2"><CheckCircle2 className="size-4 text-success" /> {t}</li>
          ))}
        </ul>
        <div className="mt-5 flex flex-col gap-2">
          <PayButton priceCents={priceCents} />
          <Link href="/assinatura" className={buttonVariants({ variant: "ghost" })}>Ver detalhes da assinatura</Link>
        </div>
      </div>
    </div>
  );
}

/** Após voltar do PagBank: consulta o pagamento e atualiza a tela. */
export function ReturnChecker() {
  const router = useRouter();
  const [state, setState] = React.useState<"checking" | "ok" | "waiting">("checking");
  const verify = React.useCallback(async () => {
    await refreshMyPaymentsAction();
    const s = await myAccessStatusAction();
    if (s.ok && s.data.status === "ativo") {
      setState("ok");
      toast.success("Pagamento confirmado! Acesso liberado por 30 dias.");
      router.refresh();
    } else setState("waiting");
  }, [router]);
  const check = () => {
    setState("checking");
    void verify();
  };
  React.useEffect(() => {
    // Sincroniza com um sistema externo (status do pagamento no PagBank); o estado muda só após a resposta.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void verify();
  }, [verify]);
  return (
    <div className="rounded-lg border border-border bg-surface-muted p-4 text-sm">
      {state === "checking" && <p className="flex items-center gap-2"><Loader2 className="size-4 animate-spin" /> Verificando seu pagamento no PagBank…</p>}
      {state === "ok" && <p className="flex items-center gap-2 text-success"><CheckCircle2 className="size-4" /> Pagamento confirmado. <Link href="/dashboard" className="underline">Ir para o dashboard</Link></p>}
      {state === "waiting" && (
        <div className="space-y-2">
          <p>Ainda não recebemos a confirmação. Pix costuma confirmar em segundos; boleto pode levar até 3 dias úteis. A liberação é automática assim que o PagBank confirmar.</p>
          <Button variant="outline" size="sm" onClick={() => void check()}><RefreshCw /> Verificar novamente</Button>
        </div>
      )}
    </div>
  );
}
