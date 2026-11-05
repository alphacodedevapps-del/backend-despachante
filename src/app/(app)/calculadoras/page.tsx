import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { Alert } from "@/components/ui/alert";
import { requireSession } from "@/lib/session";
import { Calculators } from "@/modules/studies/calculators";

export const metadata: Metadata = { title: "Calculadoras" };

export default async function CalculatorsPage() {
  await requireSession();
  return (
    <div className="space-y-4">
      <PageHeader title="Calculadoras" description="Ferramentas acadêmicas com fórmulas documentadas." icon="Calculator" />
      <Alert tone="warning" title="Uso educacional">Os resultados são estimativas para estudo e não substituem avaliação clínica, testes validados ou julgamento profissional.</Alert>
      <Calculators />
    </div>
  );
}
