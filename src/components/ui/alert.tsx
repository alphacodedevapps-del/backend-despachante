import * as React from "react";
import { AlertTriangle, Info, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils/cn";

const tones = {
  info: { cls: "border-info/30 bg-info-soft text-foreground", Icon: Info, icon: "text-info" },
  warning: { cls: "border-warning/30 bg-warning-soft text-foreground", Icon: AlertTriangle, icon: "text-warning" },
  success: { cls: "border-success/30 bg-success-soft text-foreground", Icon: CheckCircle2, icon: "text-success" },
  danger: { cls: "border-danger/30 bg-danger-soft text-foreground", Icon: XCircle, icon: "text-danger" },
};

export function Alert({ tone = "info", title, children, className }: {
  tone?: keyof typeof tones; title?: string; children?: React.ReactNode; className?: string;
}) {
  const t = tones[tone];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("flex gap-3 rounded-lg border p-3 text-sm", t.cls, className)}>
      <t.Icon className={cn("mt-0.5 size-4 shrink-0", t.icon)} aria-hidden />
      <div className="space-y-1 min-w-0">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className="text-muted-foreground">{children}</div>}
      </div>
    </div>
  );
}
