import Link from "next/link";
import { EmptyState } from "@/components/shared/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { canEditRow, canWrite, type WorkspaceRole } from "@/lib/permissions";
import { formatRelative } from "@/lib/utils/format";
import type { ResolvedRoute } from "../resolve";
import type { ListResult } from "../queries";
import { recordTitle } from "../queries";
import { FieldValue } from "./field-value";
import { DeleteRecordButton, FavoriteButton, InlineSelect } from "./record-actions";

export function EntityTable({ route, result, userId, role, hasQuery }: {
  route: ResolvedRoute;
  result: ListResult;
  userId: string;
  role: WorkspaceRole;
  hasQuery: boolean;
}) {
  const { entity } = route;
  const titleField = entity.fields.find((f) => f.name === entity.titleField)!;
  const columns = entity.fields.filter((f) => f.list && f.name !== entity.titleField && f.name !== entity.statusField).slice(0, 4);
  const statusField = entity.statusField ? entity.fields.find((f) => f.name === entity.statusField) : undefined;

  if (result.rows.length === 0) {
    return hasQuery ? (
      <EmptyState icon="Search" title="Nenhum resultado" description="Ajuste a busca ou os filtros." />
    ) : (
      <EmptyState
        icon={route.icon}
        title={`Nenhum registro em ${route.title.toLowerCase()}`}
        description={route.description}
        action={
          canWrite(role) ? (
            <Link href={`/${route.slug}/novo`} className={buttonVariants()}>
              Criar o primeiro
            </Link>
          ) : undefined
        }
      />
    );
  }

  return (
    <>
      {/* Desktop/tablet */}
      <div className="hidden overflow-x-auto rounded-lg border border-border bg-surface md:block">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-surface-muted/60 text-left text-xs font-medium text-muted-foreground">
            <tr>
              <th scope="col" className="px-4 py-2.5">{titleField.label}</th>
              {columns.map((c) => (
                <th key={c.name} scope="col" className="px-3 py-2.5 whitespace-nowrap">{c.label}</th>
              ))}
              {statusField && <th scope="col" className="px-3 py-2.5">{statusField.label}</th>}
              <th scope="col" className="px-3 py-2.5 text-right"><span className="sr-only">Ações</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {result.rows.map((row) => {
              const editable = canEditRow(role, row.created_by, userId);
              return (
                <tr key={row.id} className="hover:bg-surface-muted/50">
                  <td className="max-w-md px-4 py-2.5">
                    <Link href={`/${entity.slug}/${row.id}`} className="font-medium hover:text-primary line-clamp-2">
                      {recordTitle(entity, row)}
                    </Link>
                    <span className="text-xs text-muted-foreground">Atualizado {formatRelative(row.updated_at)}</span>
                  </td>
                  {columns.map((c) => (
                    <td key={c.name} className="max-w-56 px-3 py-2.5 align-middle">
                      <FieldValue field={c} value={row[c.name]} refLabels={result.refLabels} compact />
                    </td>
                  ))}
                  {statusField && (
                    <td className="px-3 py-2.5">
                      {editable ? (
                        <InlineSelect
                          entityKey={entity.key}
                          id={row.id}
                          field={statusField.name}
                          value={String(row[statusField.name] ?? statusField.options?.[0]?.value ?? "")}
                          options={(statusField.options ?? []).map((o) => ({ value: o.value, label: o.label }))}
                        />
                      ) : (
                        <FieldValue field={statusField} value={row[statusField.name]} compact />
                      )}
                    </td>
                  )}
                  <td className="px-3 py-2.5">
                    <div className="flex items-center justify-end gap-1">
                      {entity.favorites && <FavoriteButton entityKey={entity.key} id={row.id} value={Boolean(row.is_favorite)} disabled={!editable} />}
                      {editable && <DeleteRecordButton entityKey={entity.key} id={row.id} label={recordTitle(entity, row)} iconOnly />}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile */}
      <ul className="space-y-2 md:hidden">
        {result.rows.map((row) => {
          const editable = canEditRow(role, row.created_by, userId);
          return (
            <li key={row.id} className="rounded-lg border border-border bg-surface p-3">
              <div className="flex items-start justify-between gap-2">
                <Link href={`/${entity.slug}/${row.id}`} className="min-w-0 font-medium leading-snug hover:text-primary">
                  {recordTitle(entity, row)}
                </Link>
                {entity.favorites && <FavoriteButton entityKey={entity.key} id={row.id} value={Boolean(row.is_favorite)} disabled={!editable} />}
              </div>
              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                {[...columns, ...(statusField ? [statusField] : [])].map((c) => (
                  <div key={c.name} className="min-w-0">
                    <dt className="text-muted-foreground">{c.label}</dt>
                    <dd className="truncate"><FieldValue field={c} value={row[c.name]} refLabels={result.refLabels} compact /></dd>
                  </div>
                ))}
              </dl>
            </li>
          );
        })}
      </ul>
    </>
  );
}
