"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { saveLeagueProfileAction } from "./actions";

const FIELDS: { name: string; label: string; type?: "date" | "email" | "area"; wide?: boolean }[] = [
  { name: "name", label: "Nome da liga" },
  { name: "acronym", label: "Sigla" },
  { name: "institution", label: "Instituição" },
  { name: "foundation_date", label: "Fundação", type: "date" },
  { name: "advisor", label: "Orientador(a)" },
  { name: "contact_email", label: "E-mail de contato", type: "email" },
  { name: "description", label: "Informações gerais", type: "area", wide: true },
  { name: "objectives", label: "Objetivos", type: "area", wide: true },
  { name: "focus_areas", label: "Áreas de foco", type: "area", wide: true },
];

export function LeagueProfileForm({ initial, onDone }: { initial: Record<string, string | null>; onDone?: () => void }) {
  const router = useRouter();
  const [v, setV] = React.useState<Record<string, string>>(Object.fromEntries(FIELDS.map((f) => [f.name, initial[f.name] ?? ""])));
  const [busy, setBusy] = React.useState(false);
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const res = await saveLeagueProfileAction(v);
        setBusy(false);
        if (!res.ok) return void toast.error(res.error);
        toast.success("Informações da liga salvas.");
        onDone?.();
        router.refresh();
      }}
    >
      {FIELDS.map((f) => (
        <div key={f.name} className={`space-y-1.5 ${f.wide ? "sm:col-span-2" : ""}`}>
          <Label htmlFor={`lg-${f.name}`}>{f.label}{f.name === "name" && <span className="text-danger"> *</span>}</Label>
          {f.type === "area" ? (
            <Textarea id={`lg-${f.name}`} value={v[f.name]} onChange={(e) => setV({ ...v, [f.name]: e.target.value })} />
          ) : (
            <Input id={`lg-${f.name}`} type={f.type ?? "text"} value={v[f.name]} onChange={(e) => setV({ ...v, [f.name]: e.target.value })} required={f.name === "name"} />
          )}
        </div>
      ))}
      <div className="sm:col-span-2"><Button type="submit" disabled={busy}>{busy && <Loader2 className="animate-spin" />} Salvar</Button></div>
    </form>
  );
}
