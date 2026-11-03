import { Badge } from "@/components/ui/badge";
import { PROCESSING_LABELS } from "./constants";

const TONES = { aguardando: "warning", processando: "info", concluido: "success", falha: "danger", nao_suportado: "neutral" } as const;

export function ProcessingBadge({ status }: { status: string }) {
  return <Badge tone={TONES[status as keyof typeof TONES] ?? "neutral"}>{PROCESSING_LABELS[status] ?? status}</Badge>;
}
