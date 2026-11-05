"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

/** Lê os tokens de cor do tema atual (recalcula ao trocar o tema). */
function useChartTokens() {
  const { resolvedTheme } = useTheme();
  const [t, setT] = React.useState({ c: ["#3659a8", "#2a9d8f", "#c47f1a", "#9c6ade"], grid: "#e6eaf0", text: "#667085", surface: "#ffffff", fg: "#182230", border: "#e6eaf0" });
  React.useEffect(() => {
    // Sincroniza com um sistema externo (variáveis CSS do tema aplicadas no DOM).
    const cs = getComputedStyle(document.documentElement);
    const v = (n: string) => cs.getPropertyValue(n).trim();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setT({
      c: [v("--chart-1"), v("--chart-2"), v("--chart-3"), v("--chart-4")],
      grid: v("--chart-grid"),
      text: v("--muted-foreground"),
      surface: v("--surface"),
      fg: v("--foreground"),
      border: v("--border"),
    });
  }, [resolvedTheme]);
  return t;
}

export interface SeriesDef {
  key: string;
  label: string;
}

function tooltipStyle(t: ReturnType<typeof useChartTokens>) {
  return {
    contentStyle: { background: t.surface, border: `1px solid ${t.border}`, borderRadius: 8, color: t.fg, fontSize: 12 },
    labelStyle: { color: t.fg, fontWeight: 600 },
    itemStyle: { color: t.fg },
  };
}

/** Linhas para evolução ao longo do tempo (até 4 séries, ordem fixa de cores). */
export function TrendLines({ data, series, xKey = "label", height = 260, unit, yMax }: {
  data: Record<string, string | number | null>[];
  series: SeriesDef[];
  xKey?: string;
  height?: number;
  unit?: string;
  yMax?: number;
}) {
  const t = useChartTokens();
  return (
    <div style={{ height }} role="img" aria-label={`Gráfico de linhas: ${series.map((s) => s.label).join(", ")}`}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
          <CartesianGrid stroke={t.grid} vertical={false} />
          <XAxis dataKey={xKey} tick={{ fill: t.text, fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: t.text, fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} domain={[0, yMax ?? "auto"]} unit={unit} />
          <Tooltip {...tooltipStyle(t)} cursor={{ stroke: t.grid }} />
          {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12, color: t.text }} iconType="plainline" />}
          {series.map((s, i) => (
            <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={t.c[i % 4]} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, stroke: t.surface }} activeDot={{ r: 5 }} connectNulls />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Barras (uma série ou poucas, lado a lado). */
export function Bars({ data, series, xKey = "label", height = 240, unit, layout = "horizontal" }: {
  data: Record<string, string | number | null>[];
  series: SeriesDef[];
  xKey?: string;
  height?: number;
  unit?: string;
  layout?: "horizontal" | "vertical";
}) {
  const t = useChartTokens();
  const vertical = layout === "vertical";
  return (
    <div style={{ height }} role="img" aria-label={`Gráfico de barras: ${series.map((s) => s.label).join(", ")}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout={layout} margin={{ top: 8, right: 12, left: vertical ? 8 : -16, bottom: 0 }} barGap={2}>
          <CartesianGrid stroke={t.grid} vertical={vertical} horizontal={!vertical} />
          {vertical ? (
            <>
              <XAxis type="number" tick={{ fill: t.text, fontSize: 11 }} axisLine={false} tickLine={false} unit={unit} allowDecimals={false} />
              <YAxis type="category" dataKey={xKey} tick={{ fill: t.text, fontSize: 11 }} axisLine={false} tickLine={false} width={120} />
            </>
          ) : (
            <>
              <XAxis dataKey={xKey} tick={{ fill: t.text, fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: t.text, fontSize: 11 }} axisLine={false} tickLine={false} unit={unit} allowDecimals={false} />
            </>
          )}
          <Tooltip {...tooltipStyle(t)} cursor={{ fill: t.grid, opacity: 0.4 }} />
          {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12, color: t.text }} />}
          {series.map((s, i) => (
            <Bar key={s.key} dataKey={s.key} name={s.label} fill={t.c[i % 4]} radius={vertical ? [0, 4, 4, 0] : [4, 4, 0, 0]} maxBarSize={36} stroke={t.surface} strokeWidth={1} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Tabela acessível alternativa aos gráficos. */
export function ChartTable({ data, series, xKey = "label", xLabel = "Período" }: { data: Record<string, string | number | null>[]; series: SeriesDef[]; xKey?: string; xLabel?: string }) {
  return (
    <details className="mt-2 text-xs">
      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Ver dados em tabela</summary>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-left">
          <thead><tr className="text-muted-foreground"><th className="py-1 pr-3">{xLabel}</th>{series.map((s) => <th key={s.key} className="py-1 pr-3">{s.label}</th>)}</tr></thead>
          <tbody>{data.map((r, i) => <tr key={i} className="border-t border-border"><td className="py-1 pr-3">{String(r[xKey])}</td>{series.map((s) => <td key={s.key} className="py-1 pr-3 tabular-nums">{r[s.key] ?? "—"}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </details>
  );
}
