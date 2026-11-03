import "server-only";
import { createClient } from "@/lib/supabase/server";

export interface LinkedItem {
  link_id: string;
  relation: string;
  type: string;
  id: string;
  title: string;
  subtitle: string | null;
  created_by: string | null;
}

/** Registros relacionados (em ambas as direções) com títulos do índice de busca. */
export async function getLinkedItems(type: string, id: string): Promise<LinkedItem[]> {
  const supabase = await createClient();
  const { data: links } = await supabase
    .from("entity_links")
    .select("id, relation, source_type, source_id, target_type, target_id, created_by")
    .or(`and(source_type.eq.${type},source_id.eq.${id}),and(target_type.eq.${type},target_id.eq.${id})`)
    .order("created_at", { ascending: false })
    .limit(300);

  type L = { id: string; relation: string; source_type: string; source_id: string; target_type: string; target_id: string; created_by: string | null };
  const others = ((links ?? []) as L[]).map((l) =>
    l.source_type === type && l.source_id === id
      ? { link_id: l.id, relation: l.relation, type: l.target_type, id: l.target_id, created_by: l.created_by }
      : { link_id: l.id, relation: l.relation, type: l.source_type, id: l.source_id, created_by: l.created_by },
  );
  if (!others.length) return [];

  const { data: idx } = await supabase
    .from("search_index")
    .select("entity_type, entity_id, title, subtitle")
    .in("entity_id", others.map((o) => o.id));
  const titles = new Map(((idx ?? []) as { entity_type: string; entity_id: string; title: string; subtitle: string | null }[]).map((r) => [`${r.entity_type}:${r.entity_id}`, r]));

  return others
    .map((o) => {
      const t = titles.get(`${o.type}:${o.id}`);
      return t ? { ...o, title: t.title, subtitle: t.subtitle } : null;
    })
    .filter((x): x is LinkedItem => x !== null);
}
