import { GraduationCap } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="mb-3 flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-card">
            <GraduationCap className="size-6" />
          </span>
          <p className="text-lg font-semibold">Central Acadêmica</p>
          <p className="text-sm text-muted-foreground">Fisioterapia — formação acadêmica, científica, clínica e profissional</p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-6 shadow-card">{children}</div>
      </div>
    </div>
  );
}
