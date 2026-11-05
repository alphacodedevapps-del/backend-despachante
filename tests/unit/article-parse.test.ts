import { describe, expect, it } from "vitest";
import { parseArticleText } from "@/lib/domain/article-parse";

const SAMPLE = `Revista Brasileira de Fisioterapia, v. 24, n. 2, 2023
Reabilitação do ligamento cruzado anterior após reconstrução
Resumo: Este estudo avaliou a força muscular após a cirurgia.
Palavras-chave: joelho; ligamento cruzado anterior; reabilitação
Introdução
Texto do artigo.
doi: 10.1590/1413-355220230002
https://www.scielo.br/j/rbf/a/xyz`;

describe("Leitura de artigo por regras (sem IA)", () => {
  it("encontra título, DOI, ano, revista, URL e palavras-chave", () => {
    const r = parseArticleText(SAMPLE);
    expect(r.title).toBe("Reabilitação do ligamento cruzado anterior após reconstrução");
    expect(r.doi).toBe("10.1590/1413-355220230002");
    expect(r.year).toBe(2023);
    expect(r.journal).toMatch(/^Revista Brasileira de Fisioterapia/);
    expect(r.url).toBe("https://www.scielo.br/j/rbf/a/xyz");
    expect(r.keywords).toEqual(["joelho", "ligamento cruzado anterior", "reabilitação"]);
  });
  it("extrai o resumo até as palavras-chave", () => {
    expect(parseArticleText(SAMPLE).abstract).toBe("Este estudo avaliou a força muscular após a cirurgia.");
  });
  it("não inventa: campos ausentes ficam nulos ou vazios", () => {
    const r = parseArticleText("texto sem nada útil aqui");
    expect(r.doi).toBeNull();
    expect(r.year).toBeNull();
    expect(r.keywords).toEqual([]);
    expect(r.abstract).toBeNull();
  });
  it("ignora DOI de link do doi.org como URL e limpa pontuação do DOI", () => {
    const r = parseArticleText("Estudo de teste com título longo\nhttps://doi.org/10.1000/abc.");
    expect(r.url).toBeNull();
    expect(r.doi).toBe("10.1000/abc");
  });
  it("aceita ano só dentro de faixa plausível", () => {
    expect(parseArticleText("Título de teste importante\nNúmero 9999").year).toBeNull();
  });
});
