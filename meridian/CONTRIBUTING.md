# Meridian — Engineering Brief

Meridian is a Third-Party Risk & Vendor Management (TPRM) platform. Enterprise look: white surfaces, slate text, blue accent.

## Stack
- `server/` — Node 22 + Express + built-in `node:sqlite`. TypeScript via tsx. REST under `/api`. Cookie session auth. Zod validation.
- `web/` — Vite + React 18 + TypeScript + Tailwind v4 + React Router 6 + TanStack Query 5 + Recharts + lucide-react.
- Demo data is seeded automatically on first boot (`server/src/seed.ts`). Re-seed with `npm run seed -w server`.

## Run
```
npm install
npm run dev            # API on :4000, web on :5173 (proxies /api)
```
Demo logins (password `Meridian!2026`): avery.chen (admin), jordan.patel / priya.raman (risk_analyst), marcus.lee / sofia.martinez (procurement), daniel.okafor / hannah.weiss / liam.oconnor / noah.fischer (vendor_owner), grace.kim (auditor, read-only). Emails are `<first>.<last>@meridian.example`.

## Roles (RBAC)
| role | can |
|---|---|
| admin | everything; approves all request types; manages users/settings |
| risk_analyst | write; approves vendor onboarding/offboarding |
| procurement | write; approves contracts |
| vendor_owner | write |
| auditor | read-only (every POST/PATCH/PUT/DELETE returns 403) |

Approvers cannot decide their own requests (segregation of duties → 403).

## API conventions
- Lists: `GET /api/<resource>?q=&page=&limit=&sort=<col>&dir=asc|desc&<filter>=a,b` → `{ data, total, page, limit }`.
- Detail: `GET /api/<resource>/:id` → `{ data }` (detail includes related collections, e.g. vendor detail has contacts/contracts/assessments/documents/findings/approvals/activity).
- Create `POST`, update `PATCH`, delete `DELETE`. Errors: `{ error, details? }` with 400/401/403/404/409.
- CSV: `GET /api/vendors?format=csv`, `GET /api/contracts?format=csv`.
- Workflow actions:
  - `POST /api/vendors/:id/submit-onboarding` (prospect/onboarding → creates approval)
  - `POST /api/vendors/:id/contacts`, `DELETE /api/vendors/:id/contacts/:cid`
  - `POST /api/contracts/:id/submit-for-approval`; obligations: `POST/PATCH/DELETE /api/contracts/:id/obligations[/:oid]`
  - `POST /api/assessments` {vendor_id, template_id, assigned_to?, reviewer_id?, due_date?}; `PUT /api/assessments/:id/answers` {answers:[{question_id, answer:'yes'|'partial'|'no'|'na'|null, note?}]}; `POST /api/assessments/:id/submit`; `POST /api/assessments/:id/start-review` (submitted → under_review, reviewer = caller; assignee cannot review own work); `POST /api/assessments/:id/review` {decision:'complete'|'return', summary?}
  - Templates: `GET /api/assessments/templates`, `GET /api/assessments/templates/:id`, `POST /api/assessments/templates` {name, framework, description, questions:[{section,text,guidance?,weight}]}, `PATCH /api/assessments/templates/:id`
  - `POST /api/findings/:id/request-risk-acceptance` {justification}
  - `POST /api/approvals/:id/decide` {decision:'approved'|'rejected', comment?} (comment required on reject); `POST /api/approvals/:id/cancel`; `GET /api/approvals?mine=true` = ones my role can decide
  - Comments: `GET /api/comments?entity_type=&entity_id=`, `POST /api/comments` {entity_type, entity_id, body}, `DELETE /api/comments/:id`
  - `GET /api/activity?entity_type=&entity_id=&action=&actor_id=&q=&from=&to=`
  - `GET /api/notifications`, `POST /api/notifications/read-all`, `POST /api/notifications/:id/read`
  - `GET /api/search?q=` → grouped hits
  - `GET /api/settings`, `PUT /api/settings` (admin)
  - `GET /api/users`, `POST /api/users` (admin), `PATCH /api/users/:id` (admin)
  - `GET /api/dashboard`, `GET /api/reports` — aggregate payloads (see `server/src/routes/dashboard.ts`)
- Risk model (`server/src/risk.ts`): inherent risk 0–100 from data access + spend + category; tier derived from inherent; assessment score = weighted % of yes(1)/partial(0.5)/no(0), N/A excluded; rating low≥85, medium≥70, high≥50, else critical; residual = inherent reduced by latest completed score, plus penalty for open findings.

## Frontend conventions
- Types: `web/src/lib/types.ts`. API client: `api.get/post/patch/put/delete` + `qs()` in `web/src/lib/api.ts`. Formatters/labels/tones: `web/src/lib/format.ts` (`fmtDate`, `fmtMoney`, `LABELS.*`, `TONES.*`, `riskTone`).
- Hooks: `useAuth()` (`user`, `canWrite`, `can('admin')`), `useUsers()`, `useListParams()` (URL-synced q/page/sort/filters), `usePagedQuery()`, `useDebounce()` in `web/src/lib/hooks.ts`.
- UI kit: `web/src/components/ui/index.tsx` — `Button, Badge, Card, CardHeader, Input, Select, Textarea, Field, Checkbox, Avatar, Modal, Tabs, EmptyState, Skeleton, PageLoader, PageHeader, DataTable, Pagination, Stat, RiskScore, DescriptionList, Divider`. Toasts: `useToast()` from `components/ui/toast.tsx`.
- Pages live in `web/src/pages/**`, lazy-loaded from `web/src/App.tsx`. Path alias `@/` → `web/src/`.
- Design: white cards on `bg-ink-50`, `border-ink-200`, brand blue `brand-600` for primary actions/active nav, semantic tones for status. Dense but breathable; tabular numbers (`tnum`). Every list page: search, filters, sortable columns, pagination, empty states, loading skeletons. Every mutation: toast on success/error, invalidate queries. Respect `canWrite` (hide/disable write actions for auditors).
- Status badges: `<Badge tone={TONES.vendorStatus[v.status]} dot>{LABELS.vendorStatus[v.status]}</Badge>`.
- No code comments. Keep TypeScript strict-clean (`npx tsc -b` in `web/`).
