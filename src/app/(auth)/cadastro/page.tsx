import type { Metadata } from "next";
import { SignUpForm } from "@/modules/auth/forms";

export const metadata: Metadata = { title: "Criar conta" };

export default function SignUpPage() {
  return (
    <>
      <h1 className="mb-1 text-lg font-semibold">Criar conta</h1>
      <p className="mb-5 text-sm text-muted-foreground">Coletamos apenas o necessário: nome, e-mail e senha.</p>
      <SignUpForm />
    </>
  );
}
