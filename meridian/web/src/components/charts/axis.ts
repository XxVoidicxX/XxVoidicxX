import { AXIS, GRID, TICK } from "./palette";

export const tickStyle = { fill: TICK, fontSize: 12, fontFamily: "inherit" } as const;

export const xAxisProps = {
  tick: tickStyle,
  tickLine: false,
  axisLine: { stroke: AXIS },
  tickMargin: 8,
} as const;

export const yAxisProps = {
  tick: tickStyle,
  tickLine: false,
  axisLine: false,
  tickMargin: 8,
} as const;

export const gridProps = {
  stroke: GRID,
  strokeDasharray: "0",
} as const;

export const cursorFill = { fill: "rgba(148, 163, 184, 0.12)" } as const;
export const cursorLine = { stroke: "#94a3b8", strokeWidth: 1 } as const;

export function compactNumber(n: number): string {
  return new Intl.NumberFormat("en-US", { notation: n >= 10_000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(n);
}

export function compactMoney(n: number): string {
  if (Math.abs(n) < 1000) return `$${n}`;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 }).format(n);
}
