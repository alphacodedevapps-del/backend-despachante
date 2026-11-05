import { describe, expect, it } from "vitest";
import { ENTITIES, ENTITY_MAP, ENTITY_VIEWS, getEntity } from "@/modules/entities/definitions";
import { validateEntityInput, validatePartial, sanitizeText, initialFormValues } from "@/modules/entities/schema";
import { canEditRow, canWrite, isAdmin, assignableRoles, canManageMember } from "@/lib/permissions";
import { resolveMime, safeFileName, matchesSignature } from "@/modules/documents/constants";
import { parseContextRef } from "@/modules/assistant/context-ref";

describe("Registro de entidades", () => {
  it("todas as referências apontam para entidades existentes", () => {
    for (const e of ENTITIES) for (const f of e.fields) if (f.type === "reference") expect(ENTITY_MAP[f.reference!], `${e.key}.${f.name}`).toBeDefined();
  });
  it("slugs e chaves são únicos e o campo de título existe", () => {
    const slugs = [...ENTITIES.map((e) => e.slug), ...ENTITY_VIEWS.map((v) => v.slug)];
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const e of ENTITIES) expect(e.fields.some((f) => f.name === e.titleField), e.key).toBe(true);
  });
  it("visões filtram por valores válidos", () => {
    for (const v of ENTITY_VIEWS) {
      const f = getEntity(v.entity).fields.find((x) => x.name === v.filter.field)!;
      for (const val of v.filter.values) expect(f.options?.some((o) => o.value === val), `${v.slug}:${val}`).toBe(true);
    }
  });
});

describe("Validação genérica", () => {
  const subjects = getEntity("subjects");
  it("exige campos obrigatórios", () => {
    const r = validateEntityInput(subjects, { name: "  " });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.name).toBeTruthy();
  });
  it("normaliza números, tags e vazios", () => {
    const r = validateEntityInput(subjects, { name: "Cinesiologia", workload_hours: "80", final_grade: "8,5", tags: ["ombro", "Ombro", " joelho "], code: "" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toMatchObject({ workload_hours: 80, final_grade: 8.5, tags: ["ombro", "joelho"], code: null });
  });
  it("rejeita opções inválidas e limites numéricos", () => {
    const r = validateEntityInput(subjects, { name: "X", study_status: "hack", learning_progress: "150" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors)).toEqual(expect.arrayContaining(["study_status", "learning_progress"]));
  });
  it("caso clínico real exige anonimização confirmada", () => {
    const r = validateEntityInput(getEntity("clinical_cases"), { case_code: "CC-1", is_real_case: true, anonymization_confirmed: false });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.anonymization_confirmed).toBeTruthy();
  });
  it("sensibilidade exige fonte", () => {
    const r = validateEntityInput(getEntity("clinical_tests"), { name: "Neer", test_category: "ortopedico", sensitivity: "80" });
    expect(r.ok).toBe(false);
  });
  it("questão objetiva exige alternativas e gabarito", () => {
    const q = getEntity("questions");
    expect(validateEntityInput(q, { statement: "?", question_type: "objetiva", options: ["a"] }).ok).toBe(false);
    expect(validateEntityInput(q, { statement: "?", question_type: "objetiva", options: ["a", "b"], correct_option: "1" }).ok).toBe(true);
  });
  it("URLs só http(s) e datas coerentes", () => {
    expect(validateEntityInput(getEntity("articles"), { title: "A", url: "javascript:alert(1)" }).ok).toBe(false);
    expect(validateEntityInput(getEntity("projects"), { name: "P", project_type: "tcc", start_date: "2026-05-01", due_date: "2026-04-01" }).ok).toBe(false);
  });
  it("atualização parcial valida apenas campos conhecidos", () => {
    expect(validatePartial(getEntity("projects"), { status: "concluido" }).ok).toBe(true);
    expect(validatePartial(getEntity("projects"), { status: "x" }).ok).toBe(false);
    expect(validatePartial(getEntity("projects"), { workspace_id: "x" }).ok).toBe(false);
  });
  it("remove caracteres de controle", () => {
    expect(sanitizeText("a\u0000b\u0007c\nd")).toBe("abc\nd");
  });
  it("valores iniciais aplicam padrões e presets", () => {
    const v = initialFormValues(getEntity("league_activities"), null, { activity_type: "reuniao" });
    expect(v.activity_type).toBe("reuniao");
    expect(v.status).toBe("planejada");
  });
});

describe("Permissões (espelho da RLS)", () => {
  it("viewer não edita, member só o próprio, editor tudo", () => {
    expect(canWrite("viewer")).toBe(false);
    expect(canEditRow("viewer", "u1", "u1")).toBe(false);
    expect(canEditRow("member", "u1", "u1")).toBe(true);
    expect(canEditRow("member", "u2", "u1")).toBe(false);
    expect(canEditRow("editor", "u2", "u1")).toBe(true);
  });
  it("editor não administra membros; admin não gerencia admin nem owner", () => {
    expect(isAdmin("editor")).toBe(false);
    expect(assignableRoles("editor")).toEqual([]);
    expect(canManageMember("admin", "admin")).toBe(false);
    expect(canManageMember("owner", "admin")).toBe(true);
    expect(canManageMember("owner", "owner")).toBe(false);
  });
});

describe("Arquivos", () => {
  it("aceita somente tipos permitidos", () => {
    expect(resolveMime("aula.pdf", "application/pdf")).toBe("application/pdf");
    expect(resolveMime("x.exe", "application/octet-stream")).toBeNull();
    expect(resolveMime("slides.pptx", "")).toBe("application/vnd.openxmlformats-officedocument.presentationml.presentation");
  });
  it("gera nomes de arquivo seguros", () => {
    expect(safeFileName("../../Aula de Ombro (1).pdf")).toBe("Aula-de-Ombro-1-.pdf");
    expect(safeFileName("Fisiologia ção.pdf")).toBe("Fisiologia-cao.pdf");
  });
  it("verifica assinatura binária", () => {
    expect(matchesSignature("application/pdf", new Uint8Array([0x25, 0x50, 0x44, 0x46]))).toBe(true);
    expect(matchesSignature("application/pdf", new Uint8Array([0x4d, 0x5a]))).toBe(false);
  });
});

describe("Contexto da IA", () => {
  it("aceita apenas tipos conhecidos e UUID válido", () => {
    expect(parseContextRef("articles:123e4567-e89b-12d3-a456-426614174000")).toEqual({ type: "articles", id: "123e4567-e89b-12d3-a456-426614174000" });
    expect(parseContextRef("profiles:123e4567-e89b-12d3-a456-426614174000")).toBeNull();
    expect(parseContextRef("articles:1 or 1=1")).toBeNull();
  });
});
