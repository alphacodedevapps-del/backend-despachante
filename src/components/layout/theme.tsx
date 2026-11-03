"use client";

import * as React from "react";
import { ThemeProvider as NextThemes, useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";
import { toast } from "sonner";
import { saveThemeAction } from "@/modules/shell/actions";
import { cn } from "@/lib/utils/cn";

export function ThemeProvider({ children, defaultTheme }: { children: React.ReactNode; defaultTheme: string }) {
  return (
    <NextThemes attribute="class" defaultTheme={defaultTheme} enableSystem disableTransitionOnChange storageKey="ca-theme">
      {children}
    </NextThemes>
  );
}

/**
 * Sincroniza o tema salvo no perfil (fonte de verdade, entre dispositivos)
 * com o tema aplicado localmente.
 */
export function ThemeSync({ serverTheme }: { serverTheme: string | null }) {
  const { theme, setTheme } = useTheme();
  const synced = React.useRef(false);
  React.useEffect(() => {
    if (synced.current || !serverTheme) return;
    synced.current = true;
    if (theme !== serverTheme) setTheme(serverTheme);
  }, [serverTheme, theme, setTheme]);
  return null;
}

const OPTIONS = [
  { value: "light", label: "Claro", Icon: Sun },
  { value: "dark", label: "Escuro", Icon: Moon },
  { value: "system", label: "Automático", Icon: Monitor },
] as const;

export function ThemeSwitcher({ className, persist = true }: { className?: string; persist?: boolean }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  return (
    <div role="radiogroup" aria-label="Tema" className={cn("inline-flex rounded-lg bg-surface-muted p-1", className)}>
      {OPTIONS.map(({ value, label, Icon }) => {
        const active = mounted && theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={async () => {
              setTheme(value);
              if (persist) {
                const res = await saveThemeAction(value);
                if (!res.ok) toast.error(res.error);
              }
            }}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors cursor-pointer",
              active && "bg-surface text-foreground shadow-card",
            )}
          >
            <Icon className="size-3.5" /> {label}
          </button>
        );
      })}
    </div>
  );
}
