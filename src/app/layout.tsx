import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/layout/theme";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { getSessionContext } from "@/lib/session";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Central Acadêmica — Fisioterapia", template: "%s · Central Acadêmica" },
  description: "Ecossistema acadêmico, científico, clínico e profissional para estudantes de Fisioterapia.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F7F8FA" },
    { media: "(prefers-color-scheme: dark)", color: "#101522" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const ctx = getSupabaseEnv().configured ? await getSessionContext().catch(() => null) : null;
  const theme = ctx?.preferences?.theme ?? "system";
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className="min-h-dvh font-sans">
        <ThemeProvider defaultTheme={theme}>
          <TooltipProvider>
            {children}
            <Toaster richColors closeButton position="top-right" theme="system" toastOptions={{ className: "!font-sans" }} />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
