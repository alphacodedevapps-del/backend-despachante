import type { Metadata } from "next";
import { ResetRequestForm } from "@/modules/auth/forms";

export const metadata: Metadata = { title: "Recuperar senha" };

export default function ResetPage() {
  return (
    <>
      <h1 className="mb-1 text-lg font-semibold">Recuperar senha</h1>
      <p className="mb-5 text-sm text-muted-foreground">Enviaremos um link seguro para redefinir sua senha.</p>
      <ResetRequestForm />
    </>
  );
}
