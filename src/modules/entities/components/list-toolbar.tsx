"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, Star, X } from "lucide-react";
import { Input, NativeSelect } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

export interface FilterSpec {
  name: string;
  label: string;
  options: { value: string; label: string }[];
}

export function ListToolbar({ filters, favorites, placeholder }: { filters: FilterSpec[]; favorites?: boolean; placeholder?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = React.useState(params.get("q") ?? "");
  const [pending, startTransition] = React.useTransition();

  const update = React.useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === "") next.delete(k);
        else next.set(k, v);
      }
      next.delete("page");
      startTransition(() => router.replace(`${pathname}${next.size ? `?${next.toString()}` : ""}`, { scroll: false }));
    },
    [params, pathname, router],
  );

  React.useEffect(() => {
    const current = params.get("q") ?? "";
    if (q === current) return;
    const t = setTimeout(() => update({ q: q.trim() || null }), 300);
    return () => clearTimeout(t);
  }, [q, params, update]);

  const activeFilters = filters.filter((f) => params.get(f.name));
  const favOn = params.get("fav") === "1";

  return (
    <div className={cn("mb-4 flex flex-col gap-2 lg:flex-row lg:items-center", pending && "opacity-80")}>
      <div className="relative flex-1 min-w-0">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder ?? "Pesquisar…"} className="pl-9" aria-label="Pesquisar" />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        {filters.map((f) => (
          <NativeSelect
            key={f.name}
            aria-label={f.label}
            value={params.get(f.name) ?? ""}
            onChange={(e) => update({ [f.name]: e.target.value || null })}
            className="h-9 w-full min-w-0 sm:w-auto sm:min-w-36"
          >
            <option value="">{f.label}</option>
            {f.options.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </NativeSelect>
        ))}
        {favorites && (
          <Button variant={favOn ? "secondary" : "outline"} onClick={() => update({ fav: favOn ? null : "1" })} aria-pressed={favOn} className="w-full sm:w-auto">
            <Star className={cn(favOn && "fill-current text-warning")} /> Favoritos
          </Button>
        )}
        {(activeFilters.length > 0 || favOn || params.get("q")) && (
          <Button
            variant="ghost"
            className="w-full sm:w-auto"
            onClick={() => {
              setQ("");
              router.replace(pathname);
            }}
          >
            <X /> Limpar
          </Button>
        )}
      </div>
    </div>
  );
}
