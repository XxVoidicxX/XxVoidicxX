import { useSearchParams } from "react-router-dom";
import { Building2, ClipboardList, Info, Lock, Users, type LucideIcon } from "lucide-react";
import { Badge, PageHeader, cn } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { LABELS } from "@/lib/format";
import { OrganizationSettings } from "@/components/settings/OrganizationSettings";
import { UsersSettings } from "@/components/settings/UsersSettings";
import { TemplatesSettings } from "@/components/settings/TemplatesSettings";
import { AboutSettings } from "@/components/settings/AboutSettings";

type Tab = "organization" | "users" | "templates" | "about";
const SECTIONS: { id: Tab; label: string; description: string; icon: LucideIcon; adminOnly?: boolean; writeOnly?: boolean }[] = [
  { id: "organization", label: "Organization", description: "Name, alert windows, review cadence and risk thresholds", icon: Building2, adminOnly: true },
  { id: "users", label: "Users & roles", description: "Accounts, roles and approval authority", icon: Users, adminOnly: true },
  { id: "templates", label: "Assessment templates", description: "Questionnaires and scoring weights", icon: ClipboardList, writeOnly: true },
  { id: "about", label: "About", description: "Version, health and demo accounts", icon: Info },
];

export default function SettingsPage() {
  const { user, can, canWrite } = useAuth();
  const [sp, setSp] = useSearchParams();
  const raw = sp.get("tab") as Tab;
  const tab: Tab = SECTIONS.some((s) => s.id === raw) ? raw : "organization";
  const current = SECTIONS.find((s) => s.id === tab)!;
  const locked = (s: (typeof SECTIONS)[number]) => (s.adminOnly && !can("admin")) || (s.writeOnly && !canWrite);

  return (
    <>
      <PageHeader
        title="Settings"
        description="Configure Meridian for your organization."
        meta={!can("admin") ? <Badge tone="neutral"><Lock className="h-3 w-3" />Signed in as {LABELS.role[user?.role ?? ""]}<span className="hidden sm:inline"> · some settings are read-only</span></Badge> : undefined}
      />
      <div className="grid grid-cols-1 md:grid-cols-[15rem_minmax(0,1fr)] gap-6 items-start">
        <nav className="md:sticky md:top-20 flex md:flex-col gap-1 overflow-x-auto" aria-label="Settings sections">
          {SECTIONS.map((s) => {
            const active = s.id === tab;
            return (
              <button
                key={s.id}
                onClick={() => setSp({ tab: s.id }, { replace: true })}
                aria-current={active ? "page" : undefined}
                className={cn("group flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-left whitespace-nowrap transition-colors focus-ring", active ? "bg-white text-brand-700 shadow-card ring-1 ring-ink-200" : "text-ink-600 hover:bg-white/70 hover:text-ink-900")}
              >
                <s.icon className={cn("h-4 w-4 shrink-0", active ? "text-brand-600" : "text-ink-400 group-hover:text-ink-600")} />
                <span className="flex-1">{s.label}</span>
                {locked(s) && <Lock className="h-3.5 w-3.5 text-ink-300" aria-label="Read-only" />}
              </button>
            );
          })}
        </nav>
        <section className="min-w-0">
          <div className="mb-4">
            <h2 className="text-base font-semibold text-ink-900">{current.label}</h2>
            <p className="text-sm text-ink-500">{current.description}</p>
          </div>
          {tab === "organization" && <OrganizationSettings />}
          {tab === "users" && <UsersSettings />}
          {tab === "templates" && <TemplatesSettings />}
          {tab === "about" && <AboutSettings />}
        </section>
      </div>
    </>
  );
}
