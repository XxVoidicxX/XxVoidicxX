import type { Tier } from "@/lib/types";

export const INK = {
  50: "#f8fafc",
  100: "#f1f5f9",
  200: "#e2e8f0",
  300: "#cbd5e1",
  400: "#94a3b8",
  500: "#64748b",
  600: "#475569",
  700: "#334155",
  800: "#1e293b",
  900: "#0f172a",
} as const;

export const BRAND = {
  50: "#eff6ff",
  100: "#dbeafe",
  200: "#bfdbfe",
  300: "#93c5fd",
  400: "#60a5fa",
  500: "#3b82f6",
  600: "#2563eb",
  700: "#1d4ed8",
  800: "#1e40af",
  900: "#1e3a8a",
} as const;

export const SURFACE = "#ffffff";
export const GRID = INK[200];
export const AXIS = INK[300];
export const TICK = INK[500];
export const PRIMARY = BRAND[600];
export const PRIMARY_SOFT = "#8db7f2";

export const TIER_ORDER: Tier[] = ["critical", "high", "medium", "low"];
export const TIER_COLORS: Record<Tier, string> = {
  critical: "#b91c1c",
  high: "#d97706",
  medium: "#0ea5e9",
  low: "#059669",
};

export const CATEGORICAL = ["#2563eb", "#eb6834", "#1baf7a", "#eda100", "#6250d6", "#e87ba4"] as const;

export const FINDING_STATUS_ORDER = ["open", "in_remediation", "risk_accepted", "closed"] as const;
export type FindingStatusKey = (typeof FINDING_STATUS_ORDER)[number];
export const FINDING_STATUS_COLORS: Record<FindingStatusKey, string> = {
  open: "#1e3a8a",
  in_remediation: "#2563eb",
  risk_accepted: "#4f8ef0",
  closed: "#8db7f2",
};

const SEQUENTIAL = ["#eff6ff", "#dbeafe", "#bfdbfe", "#93c5fd", "#60a5fa", "#3b82f6", "#2563eb", "#1d4ed8", "#1e40af", "#1e3a8a"];

export function sequential(value: number, max: number): { bg: string; fg: string } {
  if (value <= 0 || max <= 0) return { bg: INK[50], fg: INK[400] };
  const t = Math.min(1, value / max);
  const idx = Math.min(SEQUENTIAL.length - 1, 1 + Math.round(t * (SEQUENTIAL.length - 2)));
  return { bg: SEQUENTIAL[idx], fg: idx >= 5 ? "#ffffff" : INK[900] };
}

export function riskBand(score: number): Tier {
  if (score >= 80) return "critical";
  if (score >= 60) return "high";
  if (score >= 35) return "medium";
  return "low";
}
export const RISK_BAND_LABEL: Record<Tier, string> = { critical: "Severe (80+)", high: "Elevated (60–79)", medium: "Moderate (35–59)", low: "Low (<35)" };

export function riskColor(score: number): string {
  return TIER_COLORS[riskBand(score)];
}

export function ratingColor(score: number): string {
  if (score >= 85) return TIER_COLORS.low;
  if (score >= 70) return TIER_COLORS.medium;
  if (score >= 50) return TIER_COLORS.high;
  return TIER_COLORS.critical;
}
