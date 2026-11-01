import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { ShieldCheck, Building2, ClipboardCheck, FileText } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Button, Field, Input } from "@/components/ui";

const DEMO = [
  { label: "Administrator", email: "avery.chen@meridian.example" },
  { label: "Risk Analyst", email: "jordan.patel@meridian.example" },
  { label: "Procurement", email: "marcus.lee@meridian.example" },
  { label: "Vendor Owner", email: "daniel.okafor@meridian.example" },
  { label: "Auditor (read-only)", email: "grace.kim@meridian.example" },
];

export function LoginPage() {
  const { user, login, loading } = useAuth();
  const nav = useNavigate();
  const loc = useLocation() as { state?: { from?: string } };
  const [email, setEmail] = useState("avery.chen@meridian.example");
  const [password, setPassword] = useState("Meridian!2026");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!loading && user) return <Navigate to={loc.state?.from || "/"} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try { await login(email, password); nav(loc.state?.from || "/", { replace: true }); }
    catch (err: any) { setError(err.message || "Sign-in failed"); }
    finally { setBusy(false); }
  };

  return (
    <div className="min-h-full grid lg:grid-cols-2">
      <div className="hidden lg:flex flex-col justify-between bg-brand-800 text-white p-12 relative overflow-hidden">
        <div className="absolute -top-40 -right-40 h-[480px] w-[480px] rounded-full bg-brand-600/40 blur-3xl" />
        <div className="absolute bottom-0 -left-20 h-[360px] w-[360px] rounded-full bg-brand-900/60 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <span className="h-10 w-10 rounded-lg bg-white/10 ring-1 ring-white/20 flex items-center justify-center">
            <svg viewBox="0 0 32 32" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M8 22V10l8 7 8-7v12" /></svg>
          </span>
          <span className="text-lg font-semibold tracking-tight">Meridian</span>
        </div>
        <div className="relative max-w-md">
          <h1 className="text-3xl font-semibold tracking-tight leading-tight">One system of record for every third party your business depends on.</h1>
          <p className="mt-4 text-brand-100 text-sm leading-relaxed">Onboard vendors, run security due diligence, track contracts and evidence, remediate findings, and prove it all to auditors — in one place.</p>
          <ul className="mt-8 space-y-3 text-sm">
            {[[Building2, "Vendor inventory with inherent & residual risk scoring"], [ClipboardCheck, "Weighted questionnaires mapped to SIG, ISO 27001 and DORA"], [FileText, "Contract lifecycle with renewals, obligations and approvals"], [ShieldCheck, "Segregation-of-duties approvals and a full audit trail"]].map(([Icon, t], i) => {
              const I = Icon as typeof Building2;
              return <li key={i} className="flex items-center gap-3 text-brand-50"><span className="h-7 w-7 rounded-md bg-white/10 flex items-center justify-center"><I className="h-4 w-4" /></span>{t as string}</li>;
            })}
          </ul>
        </div>
        <p className="relative text-xs text-brand-200">© 2026 Meridian Corp · Demo environment</p>
      </div>
      <div className="flex items-center justify-center p-6 sm:p-12 bg-white">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <span className="h-8 w-8 rounded-lg bg-brand-700 text-white flex items-center justify-center"><svg viewBox="0 0 32 32" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M8 22V10l8 7 8-7v12" /></svg></span>
            <span className="font-semibold text-ink-900">Meridian</span>
          </div>
          <h2 className="text-2xl font-semibold text-ink-900 tracking-tight">Sign in</h2>
          <p className="text-sm text-ink-500 mt-1">Use your corporate credentials to continue.</p>
          <form onSubmit={submit} className="mt-8 space-y-4">
            <Field label="Email"><Input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
            <Field label="Password"><Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
            {error && <p role="alert" className="text-sm text-danger-700 bg-danger-50 border border-danger-100 rounded-md px-3 py-2">{error}</p>}
            <Button type="submit" size="lg" className="w-full" loading={busy}>Sign in</Button>
          </form>
          <div className="mt-8">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-500 mb-2">Demo accounts</p>
            <div className="grid grid-cols-1 gap-1.5">
              {DEMO.map((d) => (
                <button key={d.email} type="button" onClick={() => { setEmail(d.email); setPassword("Meridian!2026"); }} className="flex items-center justify-between rounded-md border border-ink-200 px-3 py-2 text-left text-sm hover:border-brand-300 hover:bg-brand-50/50 transition-colors">
                  <span className="font-medium text-ink-800">{d.label}</span>
                  <span className="text-xs text-ink-500 truncate ml-2">{d.email}</span>
                </button>
              ))}
            </div>
            <p className="text-[11px] text-ink-400 mt-2">All demo accounts use the password <code className="font-mono">Meridian!2026</code>.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
