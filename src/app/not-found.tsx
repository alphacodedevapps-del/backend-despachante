import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-3 text-center">
      <p className="text-sm font-medium text-primary">404</p>
      <h1 className="text-2xl font-semibold">Página não encontrada</h1>
      <p className="text-sm text-muted-foreground">O conteúdo não existe ou você não tem acesso a ele neste workspace.</p>
      <Link href="/dashboard" className={buttonVariants()}>Voltar ao dashboard</Link>
    </div>
  );
}
