# Segurança e privacidade

## Autenticação
- Supabase Auth (e-mail/senha) com confirmação de e-mail, recuperação de senha por link (`/auth/callback` → `/auth/redefinir-senha`), sessão em cookies httpOnly (via `@supabase/ssr`), renovação no `proxy.ts`.
- Rotas privadas protegidas no proxy **e** no servidor (`requireSession`). Redirecionamentos `next` aceitam apenas caminhos internos.
- Senhas: mínimo 8 caracteres com letras e números (validado no servidor); resposta neutra na recuperação (não revela se o e-mail existe).

## Autorização (RLS)
Todas as tabelas privadas têm RLS. Regras de papéis:

| Papel | Ler | Criar | Editar/excluir | Membros/convites | Excluir workspace |
|---|---|---|---|---|---|
| owner | ✔ | ✔ | tudo | ✔ (inclusive admins) | ✔ |
| admin | ✔ | ✔ | tudo | ✔ (exceto admins/owner) | ✖ |
| editor | ✔ | ✔ | tudo | ✖ (convida só se permitido) | ✖ |
| member | ✔ | ✔ | apenas o que criou | ✖ (idem) | ✖ |
| viewer | ✔ | ✖ | ✖ | ✖ | ✖ |

- Workspace pessoal: privado, não aceita convites, não pode ser transferido nem excluído (somente com a conta).
- Conversas de IA são privadas do autor mesmo em workspaces compartilhados.
- `workspace_id`/`created_by` imutáveis após a criação; referências entre tabelas e relacionamentos só no mesmo workspace (triggers).
- Busca global e recuperação da IA aplicam o filtro de membership **antes** de ranquear (`security invoker` + `my_workspace_ids()`).
- Os testes em `tests/db/01_rls.test.sql` cobrem: isolamento A×B, viewer sem edição, editor sem administração de membros, convites expirados/reutilizados/de outro e-mail, workspace privado inacessível, trechos e Storage de outro usuário inacessíveis, imutabilidade de workspace, integridade entre workspaces.

## Convites
Token aleatório de 256 bits exibido uma única vez; o banco armazena somente o hash SHA-256 (coluna sem permissão de leitura pela API). Convite vinculado ao e-mail, com expiração configurável (1–30 dias), uso único, revogação e auditoria.

## Arquivos
- Buckets privados; caminho `{workspace_id}/{document_id}/{nome-seguro}`; políticas de Storage exigem membership (leitura), registro pendente do próprio usuário (upload) e permissão de edição (exclusão).
- Limites: 50 MB (documentos), 2 MB (avatar). MIME restrito no bucket, no banco (CHECK) e no servidor; verificação de assinatura binária antes do processamento; leitor ZIP com limite de descompactação.
- Links de acesso temporários (5–10 min).

## Validação e sanitização
Zod no cliente e no servidor; remoção de caracteres de controle; limites de tamanho por campo (também como CHECK); conteúdo do usuário nunca renderizado como HTML (sem `dangerouslySetInnerHTML`). Cabeçalhos: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`.

## Segredos
`SUPABASE_SERVICE_ROLE_KEY` e chaves de IA apenas no servidor (`server-only`); usados somente para exclusão de conta e chamadas de IA. `.env.example` sem valores reais; `.env*` no `.gitignore`.

## IA
Chamadas exclusivamente no servidor; limites diários/mensais por usuário; registro de uso e custo; documentos tratados como dados (tags de fonte escapadas, instrução explícita no prompt de sistema); IA pode ser desativada por workspace; sugestões da IA (relacionamentos, flashcards, questões, fichamentos) só são salvas após aprovação.

## LGPD
- **Finalidade e minimização:** cadastro com nome, e-mail e senha; demais campos opcionais. Casos clínicos com identificação anonimizada (faixa etária, sexo apenas se necessário), aviso de confidencialidade e bloqueio de caso real sem confirmação de anonimização.
- **Transparência:** política em `/privacidade`; consentimento no cadastro.
- **Controle:** exportação completa em JSON (`/api/export`), exclusão de conta com remoção de arquivos, saída de todos os dispositivos.
- **Auditoria:** operações sensíveis registradas em `workspace_audit_logs`.
- A plataforma é uma ferramenta de estudo e **não** é prontuário clínico profissional certificado.

## Recomendações de produção
Ative proteção contra senhas vazadas e CAPTCHA no Supabase Auth, configure SMTP próprio, restrinja *Redirect URLs* ao domínio final, habilite backups (PITR) e revise periodicamente `ai_usage_logs` e `workspace_audit_logs`.
