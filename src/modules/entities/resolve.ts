import { ENTITY_BY_SLUG, ENTITY_MAP, VIEW_BY_SLUG, type EntityDef, type EntityView } from "./definitions";

export interface ResolvedRoute {
  entity: EntityDef;
  view: EntityView | null;
  /** Slug usado na URL atual (entidade ou visão). */
  slug: string;
  title: string;
  description: string;
  icon: string;
}

export function resolveRoute(slug: string): ResolvedRoute | null {
  const view = Object.prototype.hasOwnProperty.call(VIEW_BY_SLUG, slug) ? VIEW_BY_SLUG[slug] : undefined;
  if (view) {
    const entity = ENTITY_MAP[view.entity];
    return { entity, view, slug, title: view.title, description: view.description, icon: view.icon };
  }
  const entity = Object.prototype.hasOwnProperty.call(ENTITY_BY_SLUG, slug) ? ENTITY_BY_SLUG[slug] : undefined;
  if (!entity) return null;
  return { entity, view: null, slug, title: entity.plural, description: entity.description, icon: entity.icon };
}

/** Lê presets (?campo=valor) válidos para pré-preencher formulários. */
export function presetsFromParams(entity: EntityDef, params: Record<string, string | string[] | undefined>, view: EntityView | null): Record<string, string> {
  const out: Record<string, string> = { ...(view?.defaults ?? {}) };
  for (const f of entity.fields) {
    const v = params[f.name];
    if (typeof v === "string" && v.length <= 200) out[f.name] = v;
  }
  return out;
}
