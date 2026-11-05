import { describe, expect, it } from "vitest";
import { generateAbntReference, formatAuthors, formatAccessDate } from "@/lib/domain/abnt";
import { reviewCard, resolveSrsSettings, DEFAULT_SRS } from "@/lib/domain/srs";
import { gradeQuiz } from "@/lib/domain/quiz";
import { expandOccurrences } from "@/lib/domain/recurrence";
import { chunkPages } from "@/lib/text/chunking";

describe("ABNT", () => {
  it("formata autores com sobrenome em maiúsculas", () => {
    expect(formatAuthors("Silva, João; Maria Souza")).toEqual(["SILVA, João", "SOUZA, Maria"]);
  });
  it("gera referência de artigo apenas com metadados informados", () => {
    const r = generateAbntReference({ reference_type: "artigo", authors: "Silva, Ana", title: "Reabilitação do LCA", source: "Revista Brasileira de Fisioterapia", volume: "10", issue: "2", pages: "100-110", year: 2024, doi: "10.1000/xyz" });
    expect(r.text).toBe("SILVA, Ana. Reabilitação do LCA. Revista Brasileira de Fisioterapia, v. 10, n. 2, p. 100-110, 2024. DOI: 10.1000/xyz.");
    expect(r.segments.find((s) => s.bold)?.text).toBe("Revista Brasileira de Fisioterapia");
    expect(r.missing).toEqual([]);
  });
  it("não inventa dados ausentes e lista o que falta", () => {
    const r = generateAbntReference({ reference_type: "artigo", title: "Estudo sem autor" });
    expect(r.text).not.toMatch(/undefined|null/);
    expect(r.missing).toEqual(expect.arrayContaining(["autoria", "ano", "revista"]));
    expect(r.text.startsWith("ESTUDO sem autor")).toBe(true);
  });
  it("usa et al. para mais de três autores e formata data de acesso", () => {
    const r = generateAbntReference({ reference_type: "site", authors: "A, B; C, D; E, F; G, H", title: "Página", year: 2025, url: "https://x.org", access_date: "2026-03-05" });
    expect(r.text).toContain("A, B et al.");
    expect(r.text).toContain("Acesso em: 5 mar. 2026.");
    expect(formatAccessDate("2026-05-01")).toBe("1 maio 2026");
  });
});

describe("Revisão espaçada", () => {
  const card = { ease_factor: 2.5, interval_days: 0, repetitions_count: 0 };
  const now = new Date("2026-01-01T12:00:00Z");
  it("primeiros acertos usam os intervalos configurados", () => {
    const a = reviewCard(card, "bom", DEFAULT_SRS, now);
    expect(a.interval_days).toBe(1);
    const b = reviewCard(a, "bom", DEFAULT_SRS, now);
    expect(b.interval_days).toBe(6);
    const c = reviewCard(b, "bom", DEFAULT_SRS, now);
    expect(c.interval_days).toBe(Math.round(6 * c.ease_factor));
  });
  it("erro reinicia repetições e agenda para hoje", () => {
    const r = reviewCard({ ease_factor: 2.5, interval_days: 20, repetitions_count: 5 }, "errei", DEFAULT_SRS, now);
    expect(r.repetitions_count).toBe(0);
    expect(r.interval_days).toBe(0);
    expect(r.was_correct).toBe(false);
    expect(r.ease_factor).toBeLessThan(2.5);
    expect(r.next_review_at.getTime() - now.getTime()).toBe(10 * 60 * 1000);
  });
  it("respeita facilidade mínima e intervalo máximo", () => {
    const s = resolveSrsSettings({ max_interval_days: 30, min_ease: 1.3 });
    let st = { ease_factor: 1.3, interval_days: 29, repetitions_count: 4 };
    st = reviewCard(st, "facil", s, now);
    expect(st.interval_days).toBeLessThanOrEqual(30);
    expect(reviewCard({ ease_factor: 1.3, interval_days: 1, repetitions_count: 0 }, "errei", s, now).ease_factor).toBe(1.3);
  });
  it("sanitiza configurações inválidas", () => {
    expect(resolveSrsSettings({ max_interval_days: "abc", min_ease: 99 })).toMatchObject({ max_interval_days: 365, min_ease: 2.5 });
  });
});

describe("Correção de simulados", () => {
  const qs = [
    { id: "a", question_type: "objetiva" as const, options: ["x", "y"], correct_option: 1 },
    { id: "b", question_type: "objetiva" as const, options: ["x", "y"], correct_option: 0 },
    { id: "c", question_type: "discursiva" as const, options: [], correct_option: null },
  ];
  it("corrige pelo gabarito e ignora respostas de questões fora do simulado", () => {
    const r = gradeQuiz(qs, [{ question_id: "a", selected_option: 1 }, { question_id: "b", selected_option: 1 }, { question_id: "zzz", selected_option: 0 }]);
    expect(r.objective_correct).toBe(1);
    expect(r.objective_total).toBe(2);
    expect(r.score_percent).toBe(50);
    expect(r.answers).toHaveLength(3);
  });
  it("considera autoavaliação parcial das discursivas", () => {
    const r = gradeQuiz(qs, [{ question_id: "a", selected_option: 1 }, { question_id: "b", selected_option: 0 }, { question_id: "c", text_answer: "x", self_assessed: "parcial" }]);
    expect(r.score_percent).toBeCloseTo(83.33, 1);
  });
});

describe("Recorrência de eventos", () => {
  it("expande eventos semanais dentro do intervalo e respeita a data final", () => {
    const ev = { id: "e", start_at: "2026-03-02T10:00:00Z", end_at: "2026-03-02T12:00:00Z", recurrence: "semanal", recurrence_until: "2026-03-20" };
    const occ = expandOccurrences([ev], new Date("2026-03-01T00:00:00Z"), new Date("2026-04-30T00:00:00Z"));
    expect(occ.map((o) => o.start.toISOString().slice(0, 10))).toEqual(["2026-03-02", "2026-03-09", "2026-03-16"]);
  });
  it("mantém o dia em recorrência mensal no fim do mês", () => {
    const ev = { id: "m", start_at: "2026-01-31T10:00:00Z", end_at: null, recurrence: "mensal", recurrence_until: null };
    const occ = expandOccurrences([ev], new Date("2026-01-01"), new Date("2026-04-15"));
    expect(occ.map((o) => o.start.getUTCDate())).toEqual([31, 28, 31]);
  });
  it("eventos sem recorrência fora do intervalo são ignorados", () => {
    expect(expandOccurrences([{ id: "x", start_at: "2025-01-01T00:00:00Z", end_at: null, recurrence: "nenhuma", recurrence_until: null }], new Date("2026-01-01"), new Date("2026-02-01"))).toHaveLength(0);
  });
});

describe("Divisão de documentos em trechos", () => {
  it("preserva a página de origem e respeita o tamanho máximo", () => {
    const long = "Frase de teste sobre manguito rotador. ".repeat(200);
    const chunks = chunkPages([{ page: 3, text: long }, { page: 4, text: "Joelho e LCA." }], 1000, 150);
    expect(chunks.every((c) => c.content.length <= 1000)).toBe(true);
    expect(chunks.filter((c) => c.page === 3).length).toBeGreaterThan(5);
    expect(chunks.map((c) => c.index)).toEqual(chunks.map((_, i) => i));
  });
  it("ignora páginas vazias", () => {
    expect(chunkPages([{ page: 1, text: "   " }])).toHaveLength(0);
  });
});
