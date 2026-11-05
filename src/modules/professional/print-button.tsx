"use client";

import { Copy, Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function PrintButton() {
  return <Button onClick={() => window.print()}><Printer /> Imprimir / salvar PDF</Button>;
}

export function CopyTextButton({ text, label = "Copiar" }: { text: string; label?: string }) {
  return (
    <Button variant="outline" size="sm" onClick={async () => { await navigator.clipboard.writeText(text); toast.success("Copiado."); }}>
      <Copy /> {label}
    </Button>
  );
}
