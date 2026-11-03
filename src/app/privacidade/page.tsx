import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Política de privacidade" };

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-semibold">Política de privacidade e proteção de dados</h1>
      <p className="mt-2 text-sm text-muted-foreground">Em conformidade com os princípios da Lei Geral de Proteção de Dados (Lei nº 13.709/2018).</p>
      <div className="prose-content mt-6 space-y-4 text-sm">
        <h2>Finalidade</h2>
        <p>Os dados são tratados exclusivamente para organizar sua trajetória acadêmica, científica, clínica e profissional dentro da plataforma.</p>
        <h2>Minimização</h2>
        <p>Coletamos apenas nome, e-mail e as informações que você decide registrar. Casos clínicos devem ser registrados de forma anonimizada; não insira dados que identifiquem pacientes.</p>
        <h2>Transparência e controle</h2>
        <p>Você pode exportar todos os seus dados em formato JSON e excluir sua conta a qualquer momento em <Link href="/seguranca">Segurança e privacidade</Link>.</p>
        <h2>Segurança</h2>
        <p>Os dados são isolados por usuário e por workspace com Row Level Security no banco de dados. Arquivos ficam em armazenamento privado com acesso controlado. Operações sensíveis são registradas em auditoria.</p>
        <h2>Compartilhamento</h2>
        <p>Seu workspace pessoal é privado. Conteúdos só são visíveis a outras pessoas quando você os cria em um workspace compartilhado para o qual as convidou.</p>
        <h2>Inteligência artificial</h2>
        <p>Quando a integração de IA está habilitada, trechos dos conteúdos autorizados são enviados ao provedor configurado apenas para responder às suas perguntas. O uso é registrado para controle de custos.</p>
        <h2>Uso acadêmico</h2>
        <p>A plataforma é uma ferramenta de estudo. Não constitui prontuário clínico profissional certificado nem fonte de prescrição.</p>
      </div>
      <p className="mt-8 text-sm"><Link href="/login" className="text-primary hover:underline">Voltar</Link></p>
    </main>
  );
}
