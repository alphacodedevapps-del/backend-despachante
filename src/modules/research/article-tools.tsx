"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, Download, Loader2, Save } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { generateAbntReference, type ReferenceInput } from "@/lib/domain/abnt";
import { createRecordAction } from "@/modules/entities/actions";
import { setCollectionMembershipAction } from "./actions";

export function AbntReferenceCard({ input, articleId, existingCitationId, editable }: {
  input: ReferenceInput;
  articleId: string;
  existingCitationId: string | null;
  editable: boolean;
}) {
  const router = useRouter();
  const ref = React.useMemo(() => generateAbntReference(input), [input]);
  const [saving, setSaving] = React.useState(false);
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Referência ABNT</CardTitle>
          <CardDescription>Gerada somente com os metadados cadastrados. Revise antes de usar.</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="rounded-md bg-surface-muted p-3 text-sm leading-relaxed">
          {ref.segments.map((s, i) => (s.bold ? <strong key={i}>{s.text}</strong> : <React.Fragment key={i}>{s.text}</React.Fragment>))}
        </p>
        {ref.missing.length > 0 && (
          <Alert tone="warning">Metadados ausentes (não foram inventados): {ref.missing.join(", ")}.</Alert>
        )}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={async () => { await navigator.clipboard.writeText(ref.text); toast.success("Referência copiada."); }}>
            <Copy /> Copiar
          </Button>
          {existingCitationId ? (
            <Link href={`/referencias/${existingCitationId}`} className={buttonVariants({ variant: "outline", size: "sm" })}>Ver em Referências</Link>
          ) : (
            editable && (
              <Button
                variant="outline"
                size="sm"
                disabled={saving}
                onClick={async () => {
                  setSaving(true);
                  const res = await createRecordAction("citations", {
                    reference_type: "artigo",
                    article_id: articleId,
                    authors: input.authors ?? "",
                    title: input.title ?? "",
                    source: input.source ?? "",
                    volume: input.volume ?? "",
                    issue: input.issue ?? "",
                    pages: input.pages ?? "",
                    year: input.year ?? "",
                    doi: input.doi ?? "",
                    url: input.url ?? "",
                    access_date: input.access_date ?? "",
                    formatted_reference: ref.text,
                  });
                  setSaving(false);
                  if (!res.ok) toast.error(res.error);
                  else {
                    toast.success("Salvo em Referências bibliográficas.");
                    router.refresh();
                  }
                }}
              >
                {saving ? <Loader2 className="animate-spin" /> : <Save />} Salvar em Referências
              </Button>
            )
          )}
          <a href={`/api/export/fichamento/${articleId}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
            <Download /> Exportar fichamento (.md)
          </a>
        </div>
      </CardContent>
    </Card>
  );
}

export function CollectionsPicker({ articleId, collections, memberIds, editable }: {
  articleId: string;
  collections: { id: string; name: string }[];
  memberIds: string[];
  editable: boolean;
}) {
  const [members, setMembers] = React.useState(new Set(memberIds));
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Coleções</CardTitle>
          <CardDescription>Organize este artigo em coleções temáticas.</CardDescription>
        </div>
        {editable && <Link href="/colecoes/novo" className={buttonVariants({ variant: "ghost", size: "sm" })}>Nova coleção</Link>}
      </CardHeader>
      <CardContent>
        {collections.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma coleção criada ainda.</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {collections.map((c) => (
              <li key={c.id}>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4 accent-[var(--primary)]"
                    disabled={!editable}
                    checked={members.has(c.id)}
                    onChange={async (e) => {
                      const checked = e.target.checked;
                      const next = new Set(members);
                      if (checked) next.add(c.id);
                      else next.delete(c.id);
                      setMembers(next);
                      const res = await setCollectionMembershipAction(articleId, c.id, checked);
                      if (!res.ok) {
                        toast.error(res.error);
                        setMembers(members);
                      }
                    }}
                  />
                  {c.name}
                </label>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
