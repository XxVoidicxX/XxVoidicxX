import { TICK, INK } from "./palette";

interface TickProps {
  x?: number;
  y?: number;
  payload?: { value: string | number };
}

export function dotTick(left: number, colorFor: (v: string) => string, labelFor: (v: string) => string = (v) => v) {
  return function DotTick(props: unknown) {
    const { y = 0, payload } = props as TickProps;
    const v = String(payload?.value ?? "");
    return (
      <g transform={`translate(${left},${y})`}>
        <circle cx={4} cy={0} r={4} fill={colorFor(v)} />
        <text x={14} y={0} dy={4} textAnchor="start" fill={INK[700]} fontSize={12} fontWeight={500}>{labelFor(v)}</text>
      </g>
    );
  };
}

export function truncTick(maxChars: number, labelFor: (v: string) => string = (v) => v) {
  return function TruncTick(props: unknown) {
    const { x = 0, y = 0, payload } = props as TickProps;
    const full = labelFor(String(payload?.value ?? ""));
    const text = full.length > maxChars ? `${full.slice(0, maxChars - 1).trimEnd()}…` : full;
    return (
      <g transform={`translate(${x},${y})`}>
        <title>{full}</title>
        <text x={-8} y={0} dy={4} textAnchor="end" fill={TICK} fontSize={12}>{text}</text>
      </g>
    );
  };
}

export function twoLineTick(split = "|") {
  return function TwoLineTick(props: unknown) {
    const { x = 0, y = 0, payload } = props as TickProps;
    const [a, b] = String(payload?.value ?? "").split(split);
    return (
      <g transform={`translate(${x},${y})`}>
        <text x={0} y={0} dy={12} textAnchor="middle" fill={TICK} fontSize={12}>{a}</text>
        {b && <text x={0} y={0} dy={26} textAnchor="middle" fill={INK[400]} fontSize={11}>{b}</text>}
      </g>
    );
  };
}

export function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0, 1];
  const raw = max / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const top = Math.ceil(max / step) * step;
  return Array.from({ length: Math.round(top / step) + 1 }, (_, i) => +(i * step).toFixed(6));
}
