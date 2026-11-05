import { cn } from "@/lib/utils/cn";
import { TONE_BG, type Tone } from "@/lib/domain/status";

export function Progress({ value, className, label, tone = "primary" }: { value: number; className?: string; label?: string; tone?: Tone }) {
  const v = Math.max(0, Math.min(100, Math.round(value || 0)));
  return (
    <div role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100} aria-label={label}
      className={cn("h-2 w-full overflow-hidden rounded-full bg-surface-muted", className)}>
      <div className={cn("h-full rounded-full transition-[width] duration-300", TONE_BG[tone])} style={{ width: `${v}%` }} />
    </div>
  );
}
