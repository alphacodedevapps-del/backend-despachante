"use client";

import * as React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, NativeSelect } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { calculateBmi, convertUnit, karvonen, maxHeartRateTanaka, weightedAverage, UNIT_CONVERSIONS, type ConversionKind } from "@/lib/domain/calculators";
import { formatNumber } from "@/lib/utils/format";

const num = (s: string) => Number(s.replace(",", "."));

function Result({ children }: { children: React.ReactNode }) {
  return <p className="rounded-md bg-surface-muted p-3 text-sm" aria-live="polite">{children}</p>;
}

export function Calculators() {
  const [w, setW] = React.useState("");
  const [h, setH] = React.useState("");
  const bmi = w && h ? calculateBmi(num(w), num(h)) : null;

  const [age, setAge] = React.useState("");
  const [rest, setRest] = React.useState("");
  const [pct, setPct] = React.useState("60");
  const fcmax = age ? maxHeartRateTanaka(num(age)) : null;
  const target = fcmax && rest ? karvonen(num(rest), fcmax, num(pct)) : null;

  const [kind, setKind] = React.useState<ConversionKind>("massa");
  const units = Object.keys(UNIT_CONVERSIONS[kind].units);
  const [from, setFrom] = React.useState(units[0]);
  const [to, setTo] = React.useState(units[1]);
  const [val, setVal] = React.useState("");
  const conv = val ? convertUnit(kind, num(val), from, to) : null;

  const [grades, setGrades] = React.useState([{ score: "", weight: "1" }, { score: "", weight: "1" }]);
  const avg = weightedAverage(grades.filter((g) => g.score !== "").map((g) => ({ score: num(g.score), weight: num(g.weight) })));

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader><div><CardTitle>Índice de Massa Corporal (IMC)</CardTitle><CardDescription>IMC = massa (kg) ÷ altura (m)². Classificação da OMS para adultos (≥ 20 anos).</CardDescription></div></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label htmlFor="bmi-w">Massa (kg)</Label><Input id="bmi-w" inputMode="decimal" value={w} onChange={(e) => setW(e.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="bmi-h">Altura (cm)</Label><Input id="bmi-h" inputMode="decimal" value={h} onChange={(e) => setH(e.target.value)} /></div>
          </div>
          {bmi && <Result>IMC: <strong>{formatNumber(bmi.bmi, 1)} kg/m²</strong> — {bmi.classification}</Result>}
          <p className="text-xs text-muted-foreground">Limitações: não distingue massa magra de gordura; não se aplica a crianças, gestantes e atletas sem ajuste. Uso educacional.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><div><CardTitle>Frequência cardíaca de treino</CardTitle><CardDescription>FCmáx (Tanaka, 2001) = 208 − 0,7 × idade. FC alvo (Karvonen) = FCrep + % × (FCmáx − FCrep).</CardDescription></div></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5"><Label htmlFor="hr-age">Idade</Label><Input id="hr-age" inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="hr-rest">FC repouso</Label><Input id="hr-rest" inputMode="numeric" value={rest} onChange={(e) => setRest(e.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="hr-pct">Intensidade %</Label><Input id="hr-pct" inputMode="numeric" value={pct} onChange={(e) => setPct(e.target.value)} /></div>
          </div>
          {fcmax && <Result>FCmáx estimada: <strong>{fcmax} bpm</strong>{target ? <> · FC alvo: <strong>{target} bpm</strong></> : null}</Result>}
          <p className="text-xs text-muted-foreground">Limitações: fórmulas preditivas têm erro individual relevante; uso de betabloqueadores e condições clínicas alteram a resposta. Não substitui teste de esforço.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><div><CardTitle>Conversão de unidades</CardTitle><CardDescription>Massa, comprimento, ângulo, pressão e força.</CardDescription></div></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <NativeSelect aria-label="Grandeza" value={kind} onChange={(e) => { const k = e.target.value as ConversionKind; setKind(k); const u = Object.keys(UNIT_CONVERSIONS[k].units); setFrom(u[0]); setTo(u[1]); }}>
              {Object.entries(UNIT_CONVERSIONS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </NativeSelect>
            <Input aria-label="Valor" inputMode="decimal" value={val} onChange={(e) => setVal(e.target.value)} placeholder="Valor" />
            <NativeSelect aria-label="De" value={from} onChange={(e) => setFrom(e.target.value)}>{units.map((u) => <option key={u}>{u}</option>)}</NativeSelect>
            <NativeSelect aria-label="Para" value={to} onChange={(e) => setTo(e.target.value)}>{units.map((u) => <option key={u}>{u}</option>)}</NativeSelect>
          </div>
          {conv !== null && <Result>{val} {from} = <strong>{formatNumber(conv, 4)} {to}</strong></Result>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><div><CardTitle>Média ponderada de notas</CardTitle><CardDescription>Média = Σ(nota × peso) ÷ Σ(peso).</CardDescription></div></CardHeader>
        <CardContent className="space-y-2">
          {grades.map((g, i) => (
            <div key={i} className="grid grid-cols-2 gap-2">
              <Input aria-label={`Nota ${i + 1}`} inputMode="decimal" placeholder={`Nota ${i + 1}`} value={g.score} onChange={(e) => setGrades(grades.map((x, j) => (j === i ? { ...x, score: e.target.value } : x)))} />
              <Input aria-label={`Peso ${i + 1}`} inputMode="decimal" placeholder="Peso" value={g.weight} onChange={(e) => setGrades(grades.map((x, j) => (j === i ? { ...x, weight: e.target.value } : x)))} />
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => setGrades([...grades, { score: "", weight: "1" }])}>Adicionar nota</Button>
          {avg !== null && <Result>Média ponderada: <strong>{formatNumber(avg, 2)}</strong></Result>}
        </CardContent>
      </Card>
    </div>
  );
}
