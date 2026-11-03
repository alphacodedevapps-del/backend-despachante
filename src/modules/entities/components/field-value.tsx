import Link from "next/link";
import { Check, ExternalLink, Minus } from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { formatDate, formatDateTime, formatNumber } from "@/lib/utils/format";
import { ENTITY_MAP, optionLabel, type FieldDef } from "../definitions";
import type { RefLabels } from "../queries";
import type { ChecklistItem } from "../schema";

const SUCCESS = new Set(["concluido", "concluida", "lido", "estudado", "realizada", "validada", "ativo", "ativa", "avancado", "facil"]);
const INFO = new Set(["em_andamento", "em_leitura", "em_revisao", "processando", "intermediario", "revisado", "medio"]);
const WARNING = new Set(["revisar", "pendente", "agendada", "planejada", "planejado", "alta", "aguardando", "pausada", "dificil"]);
const DANGER = new Set(["cancelada", "rejeitada", "falha", "urgente", "inativo", "arquivado", "encerrado"]);

export function toneFor(value: string): BadgeTone {
  if (SUCCESS.has(value)) return "success";
  if (INFO.has(value)) return "info";
  if (WARNING.has(value)) return "warning";
  if (DANGER.has(value)) return "danger";
  return "neutral";
}

export function FieldValue({ field, value, refLabels, compact }: {
  field: FieldDef;
  value: unknown;
  refLabels?: RefLabels;
  compact?: boolean;
}) {
  if (value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) {
    return <span className="text-muted-foreground">—</span>;
  }
  switch (field.type) {
    case "select":
      return <Badge tone={toneFor(String(value))}>{optionLabel(field, value)}</Badge>;
    case "boolean":
      return value ? <Check className="size-4 text-success" aria-label="Sim" /> : <Minus className="size-4 text-muted-foreground" aria-label="Não" />;
    case "date":
      return <span className="tabular-nums">{formatDate(String(value))}</span>;
    case "datetime":
      return <span className="tabular-nums">{formatDateTime(String(value))}</span>;
    case "number":
    case "integer":
      return <span className="tabular-nums">{formatNumber(Number(value), 2)}</span>;
    case "tags":
      return (
        <span className="flex flex-wrap gap-1">
          {(value as string[]).slice(0, compact ? 3 : 50).map((t) => (
            <Badge key={t} tone="primary">{t}</Badge>
          ))}
          {compact && (value as string[]).length > 3 && <Badge>+{(value as string[]).length - 3}</Badge>}
        </span>
      );
    case "url":
      return (
        <a href={String(value)} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-primary hover:underline break-all">
          {compact ? "Abrir" : String(value)} <ExternalLink className="size-3" />
        </a>
      );
    case "email":
      return <a href={`mailto:${String(value)}`} className="text-primary hover:underline break-all">{String(value)}</a>;
    case "reference": {
      const target = field.reference ? ENTITY_MAP[field.reference] : undefined;
      const label = target ? refLabels?.[target.key]?.[String(value)] : undefined;
      if (!target) return <span>{String(value)}</span>;
      return (
        <Link href={`/${target.slug}/${String(value)}`} className="text-primary hover:underline">
          {label || "Abrir registro"}
        </Link>
      );
    }
    case "checklist": {
      const items = value as ChecklistItem[];
      const done = items.filter((i) => i.done).length;
      if (compact) return <span className="tabular-nums">{done}/{items.length} etapas</span>;
      return (
        <ul className="space-y-1">
          {items.map((i) => (
            <li key={i.id} className="flex items-center gap-2 text-sm">
              {i.done ? <Check className="size-4 text-success" /> : <span className="size-4 rounded border border-input" />}
              <span className={i.done ? "line-through text-muted-foreground" : ""}>{i.title}</span>
            </li>
          ))}
        </ul>
      );
    }
    case "options":
      return (
        <ol className="list-[upper-alpha] space-y-1 pl-5">
          {(value as string[]).map((o, i) => (
            <li key={i}>{o}</li>
          ))}
        </ol>
      );
    case "textarea":
    case "longtext": {
      const s = String(value);
      if (compact) return <span className="line-clamp-2">{s}</span>;
      return <div className="whitespace-pre-wrap break-words leading-relaxed">{s}</div>;
    }
    default: {
      const s = String(value);
      return compact ? <span className="line-clamp-2 break-words">{s}</span> : <span className="break-words">{s}</span>;
    }
  }
}
