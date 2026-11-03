import type { Metadata } from "next";
import { NewPasswordForm } from "@/modules/auth/forms";

export const metadata: Metadata = { title: "Redefinir senha" };

export default function NewPasswordPage() {
  return (
    <>
      <h1 className="mb-1 text-lg font-semibold">Definir nova senha</h1>
      <p className="mb-5 text-sm text-muted-foreground">Escolha uma senha forte que você não use em outros serviços.</p>
      <NewPasswordForm />
    </>
  );
}
