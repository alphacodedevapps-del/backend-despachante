import type * as React from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Icon } from "@/components/shared/icon";
import { cn } from "@/lib/utils/cn";
import { TONE_BORDER, TONE_SOFT, TONE_TEXT, type Tone } from "@/lib/domain/status";

export function StatTile({ label, value, icon, href, hint, tone = "primary" }: { label: string; value: string | number; icon: string; href: string; hint?: string; tone?: Tone }) {
  return (
    <Link href={href} className={cn("group rounded-lg border border-border border-l-4 bg-surface p-4 shadow-card transition-colors hover:shadow-pop", TONE_BORDER[tone])}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <span className={cn("flex size-7 items-center justify-center rounded-md", TONE_SOFT[tone], TONE_TEXT[tone])}>
          <Icon name={icon} className="size-4" />
        </span>
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </Link>
  );
}

export function ListCard({ title, href, empty, children, action }: { title: string; href?: string; empty: string; children?: React.ReactNode; action?: React.ReactNode }) {
  const hasItems = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {action ?? (href && <Link href={href} className="text-xs text-primary hover:underline">Ver tudo</Link>)}
      </CardHeader>
      <CardContent>{hasItems ? <ul className="divide-y divide-border">{children}</ul> : <p className="text-sm text-muted-foreground">{empty}</p>}</CardContent>
    </Card>
  );
}

export function ListRow({ href, title, meta, right }: { href: string; title: string; meta?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <li className="flex items-center justify-between gap-3 py-2">
      <Link href={href} className="min-w-0 flex-1 hover:text-primary">
        <span className="block truncate text-sm font-medium">{title}</span>
        {meta && <span className="block truncate text-xs text-muted-foreground">{meta}</span>}
      </Link>
      {right && <span className="shrink-0">{right}</span>}
    </li>
  );
}
