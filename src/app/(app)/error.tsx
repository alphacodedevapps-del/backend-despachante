"use client";

import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-lg space-y-4 py-10">
      <Alert tone="danger" title="Algo deu errado">
        Não foi possível carregar esta página. {error.digest ? `Código: ${error.digest}` : ""}
      </Alert>
      <Button onClick={reset}>Tentar novamente</Button>
    </div>
  );
}
