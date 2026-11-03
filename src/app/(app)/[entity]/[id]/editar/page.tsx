import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { Alert } from "@/components/ui/alert";
import { requireSession } from "@/lib/session";
import { canEditRow } from "@/lib/permissions";
import { resolveRoute } from "@/modules/entities/resolve";
import { getRecord, recordTitle, referenceOptions } from "@/modules/entities/queries";
import { initialFormValues } from "@/modules/entities/schema";
import { EntityForm } from "@/modules/entities/components/entity-form";

type Params = Promise<{ entity: string; id: string }>;

export const metadata: Metadata = { title: "Editar" };

export default async function EditEntityPage({ params }: { params: Params }) {
  const p = await params;
  const route = resolveRoute(p.entity);
  if (!route) notFound();
  const { entity } = route;
  const ctx = await requireSession();
  const rec = await getRecord(entity, p.id);
  if (!rec) notFound();
  const title = recordTitle(entity, rec.row);

  const header = (
    <PageHeader
      title={`Editar ${entity.singular.toLowerCase()}`}
      icon={route.icon}
      breadcrumbs={[{ label: route.title, href: `/${route.slug}` }, { label: title, href: `/${entity.slug}/${p.id}` }, { label: "Editar" }]}
    />
  );

  const ws = ctx.workspaces.find((w) => w.id === rec.row.workspace_id);
  if (!ws || !canEditRow(ws.role, rec.row.created_by, ctx.user.id)) {
    return (
      <div>
        {header}
        <Alert tone="warning" title="Sem permissão">Você pode visualizar, mas não editar este registro.</Alert>
      </div>
    );
  }

  const refKeys = entity.fields.filter((f) => f.type === "reference").map((f) => f.reference!);
  const refOptions = await referenceOptions(refKeys, rec.row.workspace_id);

  return (
    <div className="mx-auto max-w-4xl">
      {header}
      <EntityForm entityKey={entity.key} mode="edit" recordId={p.id} initialValues={initialFormValues(entity, rec.row)} refOptions={refOptions} cancelHref={`/${entity.slug}/${p.id}`} />
    </div>
  );
}
