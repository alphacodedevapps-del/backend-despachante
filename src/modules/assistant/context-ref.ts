import { LINKABLE_TYPES } from "@/modules/entities/definitions";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseContextRef(ref: string | null | undefined): { type: string; id: string } | null {
  if (!ref) return null;
  const [type, id] = ref.split(":");
  if (!type || !id || !UUID_RE.test(id) || !(LINKABLE_TYPES as readonly string[]).includes(type)) return null;
  return { type, id };
}

