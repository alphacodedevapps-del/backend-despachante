import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

export function Pagination({ page, pageSize, total, basePath, params }: {
  page: number;
  pageSize: number;
  total: number;
  basePath: string;
  params: Record<string, string>;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const href = (p: number) => {
    const sp = new URLSearchParams({ ...params, page: String(p) });
    return `${basePath}?${sp.toString()}`;
  };
  return (
    <nav aria-label="Paginação" className="mt-4 flex items-center justify-between gap-2 text-sm text-muted-foreground">
      <span>
        Página {page} de {pages} · {total} registro(s)
      </span>
      <div className="flex gap-2">
        <Link aria-disabled={page <= 1} href={page > 1 ? href(page - 1) : "#"} className={cn(buttonVariants({ variant: "outline", size: "sm" }), page <= 1 && "pointer-events-none opacity-50")}>
          <ChevronLeft /> Anterior
        </Link>
        <Link aria-disabled={page >= pages} href={page < pages ? href(page + 1) : "#"} className={cn(buttonVariants({ variant: "outline", size: "sm" }), page >= pages && "pointer-events-none opacity-50")}>
          Próxima <ChevronRight />
        </Link>
      </div>
    </nav>
  );
}
