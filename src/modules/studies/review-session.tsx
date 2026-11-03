"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RotateCcw } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { reviewFlashcardAction } from "./actions";
import type { Rating } from "@/lib/domain/srs";

export interface ReviewCard {
  id: string;
  front: string;
  back: string;
  topic: string | null;
  subject: string | null;
}

const RATINGS: { value: Rating; label: string; hint: string; variant: "danger" | "outline" | "secondary" | "default"; key: string }[] = [
  { value: "errei", label: "Errei", hint: "rever hoje", variant: "danger", key: "1" },
  { value: "dificil", label: "Difícil", hint: "intervalo curto", variant: "outline", key: "2" },
  { value: "bom", label: "Bom", hint: "intervalo normal", variant: "secondary", key: "3" },
  { value: "facil", label: "Fácil", hint: "intervalo maior", variant: "default", key: "4" },
];

export function ReviewSession({ cards }: { cards: ReviewCard[] }) {
  const router = useRouter();
  const [idx, setIdx] = React.useState(0);
  const [showBack, setShowBack] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [stats, setStats] = React.useState({ right: 0, wrong: 0 });
  const card = cards[idx];

  const rate = React.useCallback(
    async (r: Rating) => {
      if (!card || busy) return;
      setBusy(true);
      const res = await reviewFlashcardAction(card.id, r);
      setBusy(false);
      if (!res.ok) return void toast.error(res.error);
      setStats((s) => (r === "errei" ? { ...s, wrong: s.wrong + 1 } : { ...s, right: s.right + 1 }));
      setShowBack(false);
      setIdx((i) => i + 1);
    },
    [card, busy],
  );

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        setShowBack(true);
      } else if (showBack) {
        const r = RATINGS.find((x) => x.key === e.key);
        if (r) void rate(r.value);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showBack, rate]);

  if (!card) {
    return (
      <div className="mx-auto max-w-xl rounded-xl border border-border bg-surface p-8 text-center">
        <p className="text-lg font-semibold">Sessão concluída!</p>
        <p className="mt-1 text-sm text-muted-foreground">{stats.right} acerto(s) · {stats.wrong} erro(s). As próximas revisões foram agendadas.</p>
        <div className="mt-4 flex justify-center gap-2">
          <Button variant="outline" onClick={() => router.refresh()}><RotateCcw /> Verificar novos pendentes</Button>
          <Link href="/flashcards" className={buttonVariants()}>Voltar aos flashcards</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>Cartão {idx + 1} de {cards.length}</span>
        <span>{stats.right} ✓ · {stats.wrong} ✗</span>
      </div>
      <Progress value={(idx / cards.length) * 100} label="Progresso da revisão" />
      <div className="rounded-xl border border-border bg-surface p-6 shadow-card sm:p-8">
        <div className="mb-4 flex flex-wrap gap-1.5">
          {card.subject && <Badge tone="primary">{card.subject}</Badge>}
          {card.topic && <Badge>{card.topic}</Badge>}
        </div>
        <p className="whitespace-pre-wrap text-lg font-medium leading-relaxed">{card.front}</p>
        {showBack && <div className="mt-6 border-t border-border pt-6 whitespace-pre-wrap leading-relaxed text-foreground/90">{card.back}</div>}
      </div>
      {!showBack ? (
        <Button className="w-full" size="lg" onClick={() => setShowBack(true)}>Mostrar resposta <span className="text-xs opacity-70">(espaço)</span></Button>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {RATINGS.map((r) => (
            <Button key={r.value} variant={r.variant} size="lg" disabled={busy} onClick={() => rate(r.value)} className="flex-col gap-0 h-auto py-2">
              <span>{r.label}</span>
              <span className="text-[11px] font-normal opacity-75">{r.hint} · {r.key}</span>
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
