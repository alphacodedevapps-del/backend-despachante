import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { Alert } from "@/components/ui/alert";
import { requireSession } from "@/lib/session";
import { canWrite } from "@/lib/permissions";
import { presetsFromParams, resolveRoute } from "@/modules/entities/resolve";
import { referenceOptions } from "@/modules/entities/queries";
import { initialFormValues } from "@/modules/entities/schema";
import { EntityForm } from "@/modules/entities/components/entity-form";
import { ArticleImportForm } from "@/modules/research/article-import";
import { publicAiStatus } from "@/lib/ai/config";

type Params = Promise<{ entity: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const r = resolveRoute((await params).entity);
  return { title: r ? `Novo(a) ${r.entity.singular.toLowerCase()}` : "Não encontrado" };
}

export default async function NewEntityPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const route = resolveRoute((await params).entity);
  if (!route) notFound();
  const { entity, view } = route;
  const ctx = await requireSession();
  const sp = await searchParams;

  const header = (
    <PageHeader
      title={`Novo(a) ${entity.singular.toLowerCase()}`}
      icon={route.icon}
      breadcrumbs={[{ label: route.title, href: `/${route.slug}` }, { label: "Novo" }]}
    />
  );

  if (!canWrite(ctx.workspace.role)) {
    return (
      <div>
        {header}
        <Alert tone="warning" title="Somente leitura">Seu papel no workspace “{ctx.workspace.name}” não permite criar conteúdo.</Alert>
      </div>
    );
  }

  const refKeys = entity.fields.filter((f) => f.type === "reference").map((f) => f.reference!);
  const refOptions = await referenceOptions(refKeys, ctx.workspace.id);
  const presets = presetsFromParams(entity, sp, view);
  const back = typeof sp.voltar === "string" && sp.voltar.startsWith("/") && !sp.voltar.startsWith("//") ? sp.voltar : `/${route.slug}`;

  return (
    <div className="mx-auto max-w-4xl">
      {header}
      <p className="mb-4 text-sm text-muted-foreground">
        Será salvo no workspace <strong className="text-foreground">{ctx.workspace.name}</strong>.
      </p>
      {entity.key === "articles" ? (
        <ArticleImportForm mode="create" initialValues={initialFormValues(entity, null, presets)} refOptions={refOptions} cancelHref={back} aiConfigured={publicAiStatus().chatConfigured} />
      ) : (
        <EntityForm entityKey={entity.key} mode="create" initialValues={initialFormValues(entity, null, presets)} refOptions={refOptions} cancelHref={back} />
      )}
    </div>
  );
}
