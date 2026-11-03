import * as React from "react";
import { Icon } from "./icon";
import { cn } from "@/lib/utils/cn";

export function EmptyState({ icon = "Sparkles", title, description, action, className, compact }: {
  icon?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-lg border border-dashed border-border text-center", compact ? "p-5" : "p-10", className)}>
      <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-surface-muted text-muted-foreground">
        <Icon name={icon} className="size-5" />
      </div>
      <p className="text-sm font-medium">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
