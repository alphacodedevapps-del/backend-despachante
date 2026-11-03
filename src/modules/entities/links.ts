import { ENTITY_MAP } from "./definitions";

/** URL de um registro de qualquer tipo indexado. */
export function entityHref(type: string, id: string): string {
  if (type === "documents") return `/arquivos/${id}`;
  const e = ENTITY_MAP[type];
  return e ? `/${e.slug}/${id}` : "#";
}

export function entityTypeLabel(type: string): string {
  if (type === "documents") return "Documento";
  return ENTITY_MAP[type]?.singular ?? type;
}

export function entityTypeIcon(type: string): string {
  if (type === "documents") return "Files";
  return ENTITY_MAP[type]?.icon ?? "FileText";
}

/** Tipos disponíveis em "Conteúdos relacionados" e na busca global. */
export const SEARCHABLE_TYPES: { type: string; label: string }[] = [
  ...Object.values(ENTITY_MAP).map((e) => ({ type: e.key, label: e.plural })),
  { type: "documents", label: "Documentos" },
];
