import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { requireSession } from "@/lib/session";
import { canWrite } from "@/lib/permissions";
import { resolveRoute } from "@/modules/entities/resolve";
import { listRecords, referenceOptions } from "@/modules/entities/queries";
import { ListToolbar, type FilterSpec } from "@/modules/entities/components/list-toolbar";
import { EntityTable } from "@/modules/entities/components/entity-table";
import { Pagination } from "@/modules/entities/components/pagination";
import { CUSTOM_LISTS } from "@/modules/entities/custom-lists";

type Params = Promise<{ entity: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const r = resolveRoute((await params).entity);
  return { title: r?.title ?? "Não encontrado" };
}

export default async function EntityListPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const route = resolveRoute((await params).entity);
  if (!route) notFound();
  const { entity, view } = route;
  const ctx = await requireSession();
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);

  const filterFields = entity.fields.filter((f) => f.filter && (f.type === "select" || f.type === "reference") && f.name !== view?.filter.field);
  const filterValues: Record<string, string> = {};
  for (const f of filterFields) {
    const v = str(f.name);
    if (v) filterValues[f.name] = v;
  }
  if (view && str(view.filter.field) && view.filter.values.includes(str(view.filter.field)!)) {
    filterValues[view.filter.field] = str(view.filter.field)!;
  }

  const refKeys = filterFields.filter((f) => f.type === "reference").map((f) => f.reference!);
  const [result, refOpts] = await Promise.all([
    listRecords(entity, ctx, { q: str("q"), filters: filterValues, favorites: str("fav") === "1", page: Number(str("page") ?? 1) || 1, view, sort: str("ordem") }),
    referenceOptions(refKeys, ctx.workspace.id),
  ]);

  const filters: FilterSpec[] = filterFields.map((f) => ({
    name: f.name,
    label: f.label,
    options: f.type === "select" ? (f.options ?? []).map((o) => ({ value: o.value, label: o.label })) : (refOpts[f.reference!] ?? []).map((o) => ({ value: o.id, label: o.label })),
  }));
  if (view && view.filter.values.length > 1) {
    const vf = entity.fields.find((f) => f.name === view.filter.field)!;
    filters.unshift({ name: vf.name, label: vf.label, options: (vf.options ?? []).filter((o) => view.filter.values.includes(o.value)).map((o) => ({ value: o.value, label: o.label })) });
  }

  const writable = canWrite(ctx.workspace.role);
  const Custom = CUSTOM_LISTS[entity.key];
  const plainParams = Object.fromEntries(Object.entries(sp).filter(([, v]) => typeof v === "string")) as Record<string, string>;

  return (
    <div>
      <PageHeader
        title={route.title}
        description={route.description}
        icon={route.icon}
        actions={
          writable ? (
            <Link href={`/${route.slug}/novo`} className={buttonVariants()}>
              <Plus /> Novo(a) {entity.singular.toLowerCase()}
            </Link>
          ) : undefined
        }
      />
      {Custom && <Custom ctx={ctx} route={route} rows={result.rows} searchParams={plainParams} />}
      <ListToolbar filters={filters} favorites={entity.favorites} placeholder={`Pesquisar em ${route.title.toLowerCase()}…`} />
      <EntityTable route={route} result={result} userId={ctx.user.id} role={ctx.workspace.role} hasQuery={Object.keys(plainParams).some((k) => k !== "page")} />
      <Pagination page={result.page} pageSize={result.pageSize} total={result.total} basePath={`/${route.slug}`} params={Object.fromEntries(Object.entries(plainParams).filter(([k]) => k !== "page"))} />
    </div>
  );
}
