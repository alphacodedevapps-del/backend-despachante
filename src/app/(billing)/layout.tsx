import Link from "next/link";
import { GraduationCap } from "lucide-react";
import { requireSession } from "@/lib/session";

export default async function BillingLayout({ children }: { children: React.ReactNode }) {
  await requireSession();
  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-2 px-4">
          <Link href="/dashboard" className="flex items-center gap-2 font-semibold">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground"><GraduationCap className="size-4" /></span>
            Central Acadêmica
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8">{children}</main>
    </div>
  );
}
