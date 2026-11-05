import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, Plus, Sparkles } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/shared/page-header";
import { requireSession } from "@/lib/session";
import { canEditRow, canWrite } from "@/lib/permissions";
import { formatDateTime } from "@/lib/utils/format";
import { resolveRoute } from "@/modules/entities/resolve";
import { getRecord, linkedChildren, recordTitle } from "@/modules/entities/queries";
import { FieldValue } from "@/modules/entities/components/field-value";
import { DeleteRecordButton, FavoriteButton } from "@/modules/entities/components/record-actions";
import { optionLabel } from "@/modules/entities/definitions";
import { getLinkedItems } from "@/modules/relations/queries";
import { RelatedContent } from "@/modules/relations/related-content";
import { AttachmentsPanel } from "@/modules/documents/attachments";
import { DETAIL_EXTENSIONS } from "@/modules/entities/extensions";
import { suggestRelationsAction } from "@/modules/assistant/actions";
import { publicAiStatus } from "@/lib/ai/config";

type Params = Promise<{ entity: string; id: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const p = await params;
  const route = resolveRoute(p.entity);
  if (!route) return { title: "Não encontrado" };
  const rec = await getRecord(route.entity, p.id);
  return { title: rec ? recordTitle(route.entity, rec.row) : route.entity.singular };
}

export default async function EntityDetailPage({ params }: { params: Params }) {
  const p = await params;
  const route = resolveRoute(p.entity);
  if (!route) notFound();
  const { entity } = route;
  const ctx = await requireSession();
  const rec = await getRecord(entity, p.id);
  if (!rec) notFound();
  const { row, refLabels } = rec;

  const ws = ctx.workspaces.find((w) => w.id === row.workspace_id);
  const role = ws?.role ?? "viewer";
  const editable = canEditRow(role, row.created_by, ctx.user.id);
  const writable = canWrite(role);
  const title = recordTitle(entity, row);

  const [children, linked] = await Promise.all([linkedChildren(entity, row.id), getLinkedItems(entity.key, row.id)]);

  const sections = new Map<string, typeof entity.fields>();
  for (const f of entity.fields) {
    if (f.name === entity.titleField) continue;
    const v = row[f.name];
    const empty = v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0) || (f.type === "boolean" && v === false);
    if (empty) continue;
    const key = f.section ?? "Informações";
    if (!sections.has(key)) sections.set(key, []);
    sections.get(key)!.push(f);
  }
  const statusField = entity.statusField ? entity.fields.find((f) => f.name === entity.statusField) : undefined;
  const Extension = DETAIL_EXTENSIONS[entity.key];
  const ai = publicAiStatus();

  return (
    <div>
      <PageHeader
        title={title}
        description={statusField && row[statusField.name] ? optionLabel(statusField, row[statusField.name]) : entity.singular}
        icon={entity.icon}
        breadcrumbs={[{ label: entity.plural, href: `/${entity.slug}` }, { label: title }]}
        actions={
          <>
            {entity.favorites && <FavoriteButton entityKey={entity.key} id={row.id} value={Boolean(row.is_favorite)} disabled={!editable} />}
            <Link href={`/assistente?contexto=${entity.key}:${row.id}`} className={buttonVariants({ variant: "outline" })}>
              <Sparkles /> <span className="sm:hidden">IA</span><span className="hidden sm:inline">Perguntar à IA</span>
            </Link>
            {editable && (
              <Link href={`/${entity.slug}/${row.id}/editar`} className={buttonVariants()}>
                <Pencil /> Editar
              </Link>
            )}
            {editable && <DeleteRecordButton entityKey={entity.key} id={row.id} label={title} redirectTo={`/${entity.slug}`} compactOnMobile />}
          </>
        }
      />

      {entity.notice && <Alert tone={entity.notice.tone} title={entity.notice.title} className="mb-4">{entity.notice.body}</Alert>}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-6">
          {Extension && <Extension row={row} ctx={ctx} editable={editable} />}
          {sections.size === 0 && (
            <Card>
              <CardContent className="pt-5 text-sm text-muted-foreground">
                Nenhum detalhe preenchido ainda.{editable && <> <Link href={`/${entity.slug}/${row.id}/editar`} className="text-primary hover:underline">Completar registro</Link>.</>}
              </CardContent>
            </Card>
          )}
          {Array.from(sections.entries()).map(([section, fields]) => (
            <Card key={section}>
              <CardHeader><CardTitle>{section}</CardTitle></CardHeader>
              <CardContent>
                <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                  {fields.map((f) => (
                    <div key={f.name} className={f.wide || f.type === "longtext" || f.type === "textarea" ? "sm:col-span-2" : ""}>
                      <dt className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{f.label}</dt>
                      <dd className="text-sm"><FieldValue field={f} value={row[f.name]} refLabels={refLabels} /></dd>
                    </div>
                  ))}
                </dl>
              </CardContent>
            </Card>
          ))}

          {children.filter((g) => g.total > 0 || g.entity.parent?.entity === entity.key).map((g) => (
            <Card key={`${g.entity.key}-${g.field}`}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">{g.entity.plural} <span className="text-xs font-normal text-muted-foreground">({g.total})</span></CardTitle>
                {writable && (
                  <Link href={`/${g.entity.slug}/novo?${g.field}=${row.id}&voltar=/${entity.slug}/${row.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                    <Plus /> Adicionar
                  </Link>
                )}
              </CardHeader>
              <CardContent>
                {g.rows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum registro.</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {g.rows.map((r) => {
                      const sf = g.entity.statusField ? g.entity.fields.find((f) => f.name === g.entity.statusField) : undefined;
                      const df = g.entity.dateField ? g.entity.fields.find((f) => f.name === g.entity.dateField) : undefined;
                      return (
                        <li key={r.id} className="flex items-center justify-between gap-3 py-2">
                          <Link href={`/${g.entity.slug}/${r.id}`} className="min-w-0 truncate text-sm font-medium hover:text-primary">{recordTitle(g.entity, r)}</Link>
                          <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                            {df && <FieldValue field={df} value={r[df.name]} compact />}
                            {sf && <FieldValue field={sf} value={r[sf.name]} compact />}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {g.total > g.rows.length && (
                  <Link href={`/${g.entity.slug}?${g.field}=${row.id}`} className="mt-2 inline-block text-xs text-primary hover:underline">Ver todos ({g.total})</Link>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        <aside className="space-y-6">
          <RelatedContent type={entity.key} id={row.id} items={linked} canEdit={writable} suggest={suggestRelationsAction} aiAvailable={ai.chatConfigured} />
          <AttachmentsPanel type={entity.key} id={row.id} canWrite={writable} />
          <Card>
            <CardContent className="space-y-1 pt-5 text-xs text-muted-foreground">
              <p>Workspace: <span className="text-foreground">{ws?.name}</span></p>
              <p>Criado em {formatDateTime(row.created_at)}</p>
              <p>Atualizado em {formatDateTime(row.updated_at)}</p>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
