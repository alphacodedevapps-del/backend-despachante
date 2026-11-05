import * as React from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Icon } from "./icon";

export interface Crumb {
  label: string;
  href?: string;
}

export function PageHeader({ title, description, icon, actions, breadcrumbs }: {
  title: string;
  description?: string;
  icon?: string;
  actions?: React.ReactNode;
  breadcrumbs?: Crumb[];
}) {
  return (
    <div className="mb-6 space-y-3">
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav aria-label="Trilha de navegação" className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
          {breadcrumbs.map((c, i) => (
            <React.Fragment key={`${c.label}-${i}`}>
              {i > 0 && <ChevronRight className="size-3" aria-hidden />}
              {c.href ? (
                <Link href={c.href} className="hover:text-foreground">{c.label}</Link>
              ) : (
                <span className="text-foreground/80 truncate max-w-[50vw]">{c.label}</span>
              )}
            </React.Fragment>
          ))}
        </nav>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          {icon && (
            <div className="hidden size-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary sm:flex">
              <Icon name={icon} className="size-5" />
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight break-words sm:text-2xl">{title}</h1>
            {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
          </div>
        </div>
        {actions && (
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap max-sm:[&>*:not([data-icon-only])]:flex-1 max-sm:[&>*]:justify-center">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}
