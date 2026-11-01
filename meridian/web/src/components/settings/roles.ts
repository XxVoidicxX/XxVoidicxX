import type { Role } from "@/lib/types";
import type { Tone } from "@/lib/format";

export const ROLES: Role[] = ["admin", "risk_analyst", "procurement", "vendor_owner", "auditor"];
export const ROLE_TONE: Record<Role, Tone> = { admin: "brand", risk_analyst: "info", procurement: "warning", vendor_owner: "success", auditor: "neutral" };
export const ROLE_DESCRIPTION: Record<Role, string> = {
  admin: "Full access. Manages users, settings and templates; can approve every request type.",
  risk_analyst: "Runs assessments and manages findings. Approves vendor onboarding, offboarding and documents.",
  procurement: "Owns commercial relationships and contracts. Approves contract requests.",
  vendor_owner: "Business owner of vendors. Creates records and raises requests but cannot approve.",
  auditor: "Read-only access to every module and the full audit trail. Cannot create, edit or decide.",
};

export const DEMO_ACCOUNTS: { name: string; email: string; role: Role; note: string }[] = [
  { name: "Avery Chen", email: "avery.chen@meridian.example", role: "admin", note: "Full administrator" },
  { name: "Jordan Patel", email: "jordan.patel@meridian.example", role: "risk_analyst", note: "Approves onboarding / offboarding" },
  { name: "Priya Raman", email: "priya.raman@meridian.example", role: "risk_analyst", note: "Assessment reviewer" },
  { name: "Marcus Lee", email: "marcus.lee@meridian.example", role: "procurement", note: "Approves contracts" },
  { name: "Sofia Martinez", email: "sofia.martinez@meridian.example", role: "procurement", note: "Raises contract requests" },
  { name: "Daniel Okafor", email: "daniel.okafor@meridian.example", role: "vendor_owner", note: "Requests risk acceptance" },
  { name: "Hannah Weiss", email: "hannah.weiss@meridian.example", role: "vendor_owner", note: "Business owner" },
  { name: "Liam O'Connor", email: "liam.oconnor@meridian.example", role: "vendor_owner", note: "Business owner" },
  { name: "Noah Fischer", email: "noah.fischer@meridian.example", role: "vendor_owner", note: "Business owner" },
  { name: "Grace Kim", email: "grace.kim@meridian.example", role: "auditor", note: "Read-only auditor" },
];
export const DEMO_PASSWORD = "Meridian!2026";
