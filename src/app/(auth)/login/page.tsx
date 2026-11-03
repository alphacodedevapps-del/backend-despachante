import type { Metadata } from "next";
import { LoginForm } from "@/modules/auth/forms";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; erro?: string }> }) {
  const sp = await searchParams;
  return (
    <>
      <h1 className="mb-1 text-lg font-semibold">Entrar</h1>
      <p className="mb-5 text-sm text-muted-foreground">Acesse sua central acadêmica.</p>
      <LoginForm next={sp.next} linkError={sp.erro === "link"} />
    </>
  );
}
