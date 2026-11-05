import { describe, expect, it } from "vitest";
import { deadlineTone, progressTone } from "@/lib/domain/status";

const NOW = new Date("2026-11-10T12:00:00").getTime();

describe("Semáforo de prazos", () => {
  it("verde quando está em dia, amarelo quando faltam até 3 dias, vermelho quando passou", () => {
    expect(deadlineTone("2026-11-20T12:00:00", "pendente", NOW)).toBe("success");
    expect(deadlineTone("2026-11-12T12:00:00", "pendente", NOW)).toBe("warning");
    expect(deadlineTone("2026-11-09T12:00:00", "pendente", NOW)).toBe("danger");
  });
  it("item concluído fica verde, mesmo com prazo passado", () => {
    expect(deadlineTone("2026-11-01T12:00:00", "concluida", NOW)).toBe("success");
    expect(deadlineTone("2026-11-01T12:00:00", "realizada", NOW)).toBe("success");
  });
  it("sem prazo fica neutro e data inválida não quebra", () => {
    expect(deadlineTone(null, "pendente", NOW)).toBe("neutral");
    expect(deadlineTone("não é data", "pendente", NOW)).toBe("neutral");
  });
  it("data só com dia conta até o fim do dia", () => {
    expect(deadlineTone("2026-11-10", "pendente", NOW)).toBe("warning");
  });
});

describe("Semáforo de progresso", () => {
  it("vermelho abaixo de 30%, amarelo até 69%, verde a partir de 70%", () => {
    expect(progressTone(0)).toBe("danger");
    expect(progressTone(29)).toBe("danger");
    expect(progressTone(30)).toBe("warning");
    expect(progressTone(69)).toBe("warning");
    expect(progressTone(70)).toBe("success");
    expect(progressTone(null)).toBe("danger");
  });
});
