import { cn } from "@/lib/utils/cn";

export function Progress({ value, className, label }: { value: number; className?: string; label?: string }) {
  const v = Math.max(0, Math.min(100, Math.round(value || 0)));
  return (
    <div role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100} aria-label={label}
      className={cn("h-2 w-full overflow-hidden rounded-full bg-surface-muted", className)}>
      <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${v}%` }} />
    </div>
  );
}
