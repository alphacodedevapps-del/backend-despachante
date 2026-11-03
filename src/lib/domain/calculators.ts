/** Calculadoras acadêmicas com fórmulas documentadas. */

export interface BmiResult {
  bmi: number;
  classification: string;
}

/** IMC = massa (kg) / altura (m)². Classificação OMS para adultos (≥ 20 anos). */
export function calculateBmi(weightKg: number, heightCm: number): BmiResult | null {
  if (!(weightKg > 0) || !(heightCm > 0) || weightKg > 700 || heightCm > 300) return null;
  const h = heightCm / 100;
  const bmi = Math.round((weightKg / (h * h)) * 10) / 10;
  let classification = "Obesidade grau III";
  if (bmi < 18.5) classification = "Baixo peso";
  else if (bmi < 25) classification = "Eutrofia (peso adequado)";
  else if (bmi < 30) classification = "Sobrepeso";
  else if (bmi < 35) classification = "Obesidade grau I";
  else if (bmi < 40) classification = "Obesidade grau II";
  return { bmi, classification };
}

/** Frequência cardíaca máxima estimada (Tanaka, Monahan & Seals, 2001): 208 − 0,7 × idade. */
export function maxHeartRateTanaka(age: number): number | null {
  if (!(age > 0) || age > 120) return null;
  return Math.round(208 - 0.7 * age);
}

/** Zona de treino pela fórmula de Karvonen: FCalvo = FCrep + %(FCmáx − FCrep). */
export function karvonen(restingHr: number, maxHr: number, intensityPercent: number): number | null {
  if (!(restingHr > 0) || !(maxHr > restingHr) || intensityPercent < 0 || intensityPercent > 100) return null;
  return Math.round(restingHr + (intensityPercent / 100) * (maxHr - restingHr));
}

/** Média ponderada de notas: Σ(nota × peso) / Σ(peso). */
export function weightedAverage(items: { score: number; weight: number }[]): number | null {
  const valid = items.filter((i) => Number.isFinite(i.score) && i.weight > 0);
  const totalWeight = valid.reduce((s, i) => s + i.weight, 0);
  if (totalWeight === 0) return null;
  return Math.round((valid.reduce((s, i) => s + i.score * i.weight, 0) / totalWeight) * 100) / 100;
}

export const UNIT_CONVERSIONS = {
  massa: { label: "Massa", units: { kg: 1, g: 0.001, lb: 0.45359237 } },
  comprimento: { label: "Comprimento", units: { m: 1, cm: 0.01, mm: 0.001, in: 0.0254, ft: 0.3048 } },
  angulo: { label: "Ângulo", units: { grau: 1, radiano: 180 / Math.PI } },
  pressao: { label: "Pressão", units: { mmHg: 1, kPa: 7.50061683, cmH2O: 0.73555924 } },
  forca: { label: "Força", units: { N: 1, kgf: 9.80665, lbf: 4.4482216 } },
} as const;

export type ConversionKind = keyof typeof UNIT_CONVERSIONS;

export function convertUnit(kind: ConversionKind, value: number, from: string, to: string): number | null {
  const units = UNIT_CONVERSIONS[kind].units as Record<string, number>;
  if (!(from in units) || !(to in units) || !Number.isFinite(value)) return null;
  return Math.round(((value * units[from]) / units[to]) * 10000) / 10000;
}
