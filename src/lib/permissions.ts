/**
 * Espelho no cliente/servidor das regras de autorização do banco (RLS).
 * A fonte de verdade é o PostgreSQL; estas funções servem para esconder
 * ações indisponíveis na interface e validar antes de chamar o banco.
 */
export type WorkspaceRole = "owner" | "admin" | "editor" | "member" | "viewer";

export const ROLE_LABELS: Record<WorkspaceRole, string> = {
  owner: "Proprietário",
  admin: "Administrador",
  editor: "Editor",
  member: "Membro",
  viewer: "Leitor",
};

export const ROLE_DESCRIPTIONS: Record<WorkspaceRole, string> = {
  owner: "Controle total, incluindo exclusão e transferência do workspace.",
  admin: "Gerencia membros, convites e configurações; edita todo o conteúdo.",
  editor: "Cria e edita todo o conteúdo; não administra membros.",
  member: "Cria conteúdo e edita apenas o que criou.",
  viewer: "Somente leitura.",
};

export const WORKSPACE_TYPES = {
  pessoal: "Pessoal",
  grupo_estudos: "Grupo de estudos",
  liga: "Liga acadêmica",
  projeto: "Projeto científico",
  institucional: "Institucional",
} as const;
export type WorkspaceType = keyof typeof WORKSPACE_TYPES;

export function canWrite(role: WorkspaceRole | null | undefined): boolean {
  return role === "owner" || role === "admin" || role === "editor" || role === "member";
}

export function canEditRow(role: WorkspaceRole | null | undefined, createdBy: string | null | undefined, userId: string): boolean {
  if (role === "owner" || role === "admin" || role === "editor") return true;
  if (role === "member") return !!createdBy && createdBy === userId;
  return false;
}

export function isAdmin(role: WorkspaceRole | null | undefined): boolean {
  return role === "owner" || role === "admin";
}

/** Papéis que `actor` pode atribuir a outros membros. */
export function assignableRoles(actor: WorkspaceRole | null | undefined): WorkspaceRole[] {
  if (actor === "owner") return ["admin", "editor", "member", "viewer"];
  if (actor === "admin") return ["editor", "member", "viewer"];
  return [];
}

export function canManageMember(actor: WorkspaceRole | null | undefined, target: WorkspaceRole): boolean {
  if (target === "owner") return false;
  if (actor === "owner") return true;
  if (actor === "admin") return target !== "admin";
  return false;
}
