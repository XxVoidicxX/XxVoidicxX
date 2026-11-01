import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, KeyRound, Minus, Pencil, Search, ShieldCheck, UserPlus, Wand2 } from "lucide-react";
import { Avatar, Badge, Button, Card, CardHeader, DataTable, Field, Input, Modal, Select, type Column } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useUsers } from "@/lib/hooks";
import { LABELS } from "@/lib/format";
import type { Role, User } from "@/lib/types";
import { APPROVAL_TYPES, APPROVER_ROLES } from "@/components/approvals/rules";
import { Switch } from "./Switch";
import { ROLES, ROLE_DESCRIPTION, ROLE_TONE } from "./roles";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function genPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const arr = new Uint32Array(12);
  crypto.getRandomValues(arr);
  return Array.from(arr, (n) => chars[n % chars.length]).join("") + "!";
}

export function RoleBadge({ role }: { role: Role }) {
  return <Badge tone={ROLE_TONE[role]}>{LABELS.role[role]}</Badge>;
}

interface FormState { name: string; email: string; role: Role; department: string; title: string; password: string; active: boolean }
const EMPTY: FormState = { name: "", email: "", role: "vendor_owner", department: "", title: "", password: "", active: true };

function UserModal({ open, onClose, user }: { open: boolean; onClose: () => void; user: User | null }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { user: me } = useAuth();
  const editing = !!user;
  const self = editing && user!.id === me?.id;
  const [f, setF] = useState<FormState>(EMPTY);
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<{ field?: string; message: string } | null>(null);
  useEffect(() => {
    if (!open) return;
    setSubmitted(false); setServerError(null);
    setF(user ? { name: user.name, email: user.email, role: user.role, department: user.department ?? "", title: user.title ?? "", password: "", active: !!user.active } : { ...EMPTY, password: genPassword() });
  }, [open, user]);

  const errors: Partial<Record<keyof FormState, string>> = {};
  if (!f.name.trim()) errors.name = "Name is required";
  if (!editing && !EMAIL_RE.test(f.email.trim())) errors.email = "Enter a valid email address";
  if ((!editing || f.password) && f.password.length < 6) errors.password = "At least 6 characters";
  const err = (k: keyof FormState) => (serverError?.field === k ? serverError.message : submitted ? errors[k] : undefined);

  const m = useMutation({
    mutationFn: () => {
      const base = { name: f.name.trim(), role: f.role, department: f.department.trim() || (editing ? null : undefined), title: f.title.trim() || (editing ? null : undefined) };
      return editing
        ? api.patch<{ data: User }>(`/api/users/${user!.id}`, { ...base, active: f.active, ...(f.password ? { password: f.password } : {}) })
        : api.post<{ data: User }>("/api/users", { ...base, email: f.email.trim(), password: f.password });
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["users"] });
      qc.invalidateQueries({ queryKey: ["activity"] });
      toast("success", editing ? "User updated" : "User invited", editing ? r.data.name : `${r.data.name} can now sign in as ${LABELS.role[r.data.role]}.`);
      onClose();
    },
    onError: (e) => {
      const msg = e instanceof ApiError ? e.message : "Something went wrong";
      setServerError({ field: e instanceof ApiError && e.status === 409 ? "email" : undefined, message: msg });
      toast("error", editing ? "Could not update user" : "Could not invite user", msg);
    },
  });
  const submit = () => { setSubmitted(true); setServerError(null); if (!Object.keys(errors).length) m.mutate(); };
  const upd = <K extends keyof FormState>(k: K, v: FormState[K]) => { setF((x) => ({ ...x, [k]: v })); if (serverError?.field === k) setServerError(null); };

  return (
    <Modal open={open} onClose={() => !m.isPending && onClose()} size="lg"
      title={editing ? `Edit ${user!.name}` : "Invite user"}
      description={editing ? user!.email : "Create an account and share the temporary password securely."}
      footer={<><Button variant="secondary" onClick={onClose} disabled={m.isPending}>Cancel</Button><Button icon={editing ? Check : UserPlus} loading={m.isPending} onClick={submit}>{editing ? "Save changes" : "Invite user"}</Button></>}
    >
      <form className="grid grid-cols-1 sm:grid-cols-2 gap-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <Field label="Full name" required error={err("name")}><Input value={f.name} onChange={(e) => upd("name", e.target.value)} invalid={!!err("name")} autoFocus placeholder="Jane Doe" /></Field>
        <Field label="Email" required={!editing} error={err("email")} hint={editing ? "Email addresses cannot be changed." : undefined}>
          <Input type="email" value={f.email} onChange={(e) => upd("email", e.target.value)} invalid={!!err("email")} disabled={editing} placeholder="jane.doe@meridian.example" />
        </Field>
        <Field label="Role" required hint={self ? "You cannot change your own role." : ROLE_DESCRIPTION[f.role]} className="sm:col-span-2">
          <Select value={f.role} onChange={(e) => upd("role", e.target.value as Role)} disabled={self} aria-label="Role">
            {ROLES.map((r) => <option key={r} value={r}>{LABELS.role[r]}</option>)}
          </Select>
        </Field>
        <Field label="Department"><Input value={f.department} onChange={(e) => upd("department", e.target.value)} placeholder="e.g. Procurement" /></Field>
        <Field label="Job title"><Input value={f.title} onChange={(e) => upd("title", e.target.value)} placeholder="e.g. Sourcing Manager" /></Field>
        <Field label={editing ? "Reset password" : "Temporary password"} required={!editing} error={err("password")} hint={editing ? "Leave blank to keep the current password." : "Share this with the user through a secure channel."} className="sm:col-span-2">
          <div className="flex gap-2">
            <Input value={f.password} onChange={(e) => upd("password", e.target.value)} invalid={!!err("password")} placeholder={editing ? "New password" : ""} className="font-mono" autoComplete="new-password" />
            <Button type="button" variant="secondary" icon={editing ? KeyRound : Wand2} onClick={() => upd("password", genPassword())}>Generate</Button>
          </div>
        </Field>
        {editing && (
          <div className="sm:col-span-2 flex items-center justify-between rounded-lg border border-ink-200 p-3">
            <div>
              <p className="text-sm font-medium text-ink-800">Account active</p>
              <p className="text-xs text-ink-500">{self ? "You cannot deactivate your own account." : "Inactive users cannot sign in. Their history is preserved."}</p>
            </div>
            <Switch checked={f.active} onChange={(v) => upd("active", v)} disabled={self} label="Account active" />
          </div>
        )}
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}

export function UsersSettings() {
  const { can, user: me } = useAuth();
  const isAdmin = can("admin");
  const qc = useQueryClient();
  const { toast } = useToast();
  const users = useUsers();
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [modal, setModal] = useState<{ open: boolean; user: User | null }>({ open: false, user: null });
  const [pendingId, setPendingId] = useState<number | null>(null);

  const toggle = useMutation({
    mutationFn: (u: User) => api.patch<{ data: User }>(`/api/users/${u.id}`, { active: !u.active }),
    onMutate: (u) => setPendingId(u.id),
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ["users"] }); qc.invalidateQueries({ queryKey: ["activity"] }); toast("success", r.data.active ? "User reactivated" : "User deactivated", r.data.name); },
    onError: (e) => toast("error", "Could not update user", e instanceof ApiError ? e.message : undefined),
    onSettled: () => setPendingId(null),
  });

  const all = users.data ?? [];
  const rows = useMemo(() => {
    const s = search.trim().toLowerCase();
    return all.filter((u) => (!role || u.role === role) && (!s || [u.name, u.email, u.department, u.title].some((x) => x?.toLowerCase().includes(s))));
  }, [all, search, role]);
  const counts = useMemo(() => Object.fromEntries(ROLES.map((r) => [r, all.filter((u) => u.role === r && u.active).length])), [all]);

  const columns: Column<User>[] = [
    {
      key: "name", header: "User", render: (u) => (
        <div className="flex items-center gap-3 min-w-0">
          <Avatar name={u.name} />
          <div className="min-w-0 leading-tight">
            <p className="font-medium text-ink-900 truncate">{u.name}{u.id === me?.id && <span className="ml-1.5 text-xs font-normal text-ink-400">(you)</span>}</p>
            <p className="text-xs text-ink-500 truncate">{u.email}</p>
          </div>
        </div>
      ),
    },
    { key: "role", header: "Role", render: (u) => <RoleBadge role={u.role} /> },
    {
      key: "department", header: "Department & title", render: (u) => (
        <div className="leading-tight min-w-0 max-w-[12rem] 2xl:max-w-[16rem]">
          <p className="text-ink-800 truncate">{u.department ?? "—"}</p>
          {u.title && <p className="text-xs text-ink-500 truncate mt-0.5">{u.title}</p>}
        </div>
      ),
    },
    {
      key: "active", header: "Active", align: "center", render: (u) => (
        <div className="inline-flex items-center gap-2">
          <Switch checked={!!u.active} onChange={() => toggle.mutate(u)} disabled={!isAdmin || u.id === me?.id} loading={pendingId === u.id} label={`${u.active ? "Deactivate" : "Activate"} ${u.name}`} />
        </div>
      ),
    },
  ];
  if (isAdmin) columns.push({ key: "edit", header: <span className="sr-only">Edit</span>, align: "right", render: (u) => <Button size="xs" variant="ghost" icon={Pencil} onClick={(e) => { e.stopPropagation(); setModal({ open: true, user: u }); }}>Edit</Button> });

  return (
    <div className="space-y-6">
      <Card padded={false}>
        <div className="flex flex-wrap items-start justify-between gap-3 p-5 pb-4">
          <div>
            <h3 className="text-sm font-semibold text-ink-900">Users</h3>
            <p className="text-sm text-ink-500 mt-0.5">{all.filter((u) => u.active).length} active of {all.length} accounts</p>
          </div>
          {isAdmin && <Button icon={UserPlus} onClick={() => setModal({ open: true, user: null })}>Invite user</Button>}
        </div>
        <div className="flex flex-wrap items-center gap-2 px-5 pb-4">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-400" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email, department…" className="pl-9" aria-label="Search users" />
          </div>
          <Select value={role} onChange={(e) => setRole(e.target.value)} className="!w-44 shrink-0" aria-label="Filter by role">
            <option value="">All roles</option>
            {ROLES.map((r) => <option key={r} value={r}>{LABELS.role[r]}</option>)}
          </Select>
          {!isAdmin && <span className="ml-auto text-xs text-ink-500">Only administrators can manage users.</span>}
        </div>
        <div className="border-t border-ink-200">
          <DataTable<User> columns={columns} rows={rows} loading={users.isLoading} onRowClick={isAdmin ? (u) => setModal({ open: true, user: u }) : undefined} emptyTitle="No users match" emptyDescription="Try a different search or role filter." />
        </div>
      </Card>
      <Card>
        <CardHeader title="Roles & approval authority" description="Access is role-based. Approvers can never decide requests they raised themselves (segregation of duties)." />
        <div className="space-y-6">
          <ul className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-4">
            {ROLES.map((r) => (
              <li key={r} className="flex gap-3">
                <div className="w-32 shrink-0 pt-0.5"><RoleBadge role={r} /></div>
                <div className="min-w-0">
                  <p className="text-sm text-ink-700">{ROLE_DESCRIPTION[r]}</p>
                  <p className="text-xs text-ink-400 mt-0.5 tnum">{counts[r] ?? 0} active user{counts[r] === 1 ? "" : "s"}</p>
                </div>
              </li>
            ))}
          </ul>
          <div className="overflow-x-auto rounded-lg border border-ink-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-ink-50/70 border-b border-ink-200">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-ink-500">Request type</th>
                  {ROLES.map((r) => <th key={r} className="px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-ink-500 whitespace-nowrap">{LABELS.role[r]}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {APPROVAL_TYPES.map((t) => (
                  <tr key={t}>
                    <td className="px-4 py-2.5 text-ink-800 whitespace-nowrap">{LABELS.approvalType[t]}</td>
                    {ROLES.map((r) => (
                      <td key={r} className="px-3 py-2.5 text-center">
                        {APPROVER_ROLES[t].includes(r)
                          ? <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-success-50 text-success-600" aria-label="Can approve"><Check className="h-3.5 w-3.5" /></span>
                          : <Minus className="h-3.5 w-3.5 mx-auto text-ink-300" aria-label="Cannot approve" />}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="flex items-center gap-1.5 px-4 py-2 text-xs text-ink-500 border-t border-ink-100 bg-ink-50/40"><ShieldCheck className="h-3.5 w-3.5" />Auditors have read-only access everywhere.</p>
          </div>
        </div>
      </Card>
      <UserModal open={modal.open} user={modal.user} onClose={() => setModal({ open: false, user: null })} />
    </div>
  );
}
