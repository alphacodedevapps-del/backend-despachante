/** Tradução de erros do PostgreSQL/Supabase para mensagens amigáveis. */
export interface DbErrorLike {
  code?: string;
  message?: string;
  details?: string | null;
}

export function friendlyDbError(error: DbErrorLike | null | undefined): string {
  if (!error) return "Erro desconhecido.";
  const msg = error.message ?? "";
  switch (error.code) {
    case "42501":
      return msg && !/row-level security|permission denied/i.test(msg) ? msg : "Você não tem permissão para esta operação neste workspace.";
    case "23505":
      return "Já existe um registro com esses dados.";
    case "23503":
      return msg.startsWith("Referência inválida") ? msg : "Registro relacionado inválido ou inexistente.";
    case "23514":
      return "Os dados violam uma regra de validação. Revise os campos.";
    case "22P02":
      return "Formato de dado inválido.";
    case "P0001":
    case "P0002":
      return msg || "Operação não permitida.";
    case "PGRST116":
      return "Registro não encontrado.";
  }
  if (/row-level security/i.test(msg)) return "Você não tem permissão para esta operação neste workspace.";
  if (/JWT|not authenticated/i.test(msg)) return "Sua sessão expirou. Entre novamente.";
  return msg || "Não foi possível concluir a operação.";
}

export type ActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export function fail(error: string, fieldErrors?: Record<string, string>): { ok: false; error: string; fieldErrors?: Record<string, string> } {
  return { ok: false, error, fieldErrors };
}
