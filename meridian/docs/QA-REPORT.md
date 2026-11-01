# Meridian — Build & QA Summary

## How it was built
- Lead designed the product, data model, risk engine, API, seed data, UI kit and app shell.
- Five parallel build agents (Claude Opus) each owned one module: Vendors; Contracts & Documents; Assessments & Findings; Dashboard & Reports; Approvals, Audit Log & Settings.
- Four tester agents (Claude Sonnet) then used the running app as real users through a browser: a risk analyst, a procurement manager, the admin, and an adversarial QA/accessibility engineer. One fix agent (Opus) closed the page-level findings; the lead closed server and UI-kit findings.

## Test coverage
- 35 API integration tests (`npm test`): auth, RBAC, onboarding approval workflow, assessment scoring and review, risk acceptance, contracts and obligations, documents, comments, search, dashboard/reports, and hardening (approval bypass, validation, malformed bodies, delete cascade, CSV injection, login throttling).
- Browser UAT scripts covered every route at 1440/1024/390/320 widths, keyboard navigation, modal focus, XSS/SQL payloads, IDOR attempts, concurrency (50 parallel dashboard reads, 20 parallel answer writes), and performance (page ready 0.3–0.5 s, API p90 ≤ 11 ms on the dev server).

## Defects found by testers and fixed
| Area | Defect | Fix |
|---|---|---|
| Security | Non-admins could set a vendor or contract to Active directly, bypassing approvals | Server returns 403; UI hides the options |
| Security | Malformed JSON / 3 MB bodies / absurd page numbers returned 500 | Proper 400/413, page clamp |
| Security | CSV exports vulnerable to spreadsheet formula injection | Leading `= + - @` are escaped |
| Security | No sign-in throttling; no security headers | 25 failures per address → 429 for 15 min; nosniff, frame-deny, referrer, permissions headers |
| Integrity | Deleting a vendor left pending approvals that could still be approved | Delete cascades: approvals cancelled, comments removed; deciding a request on a missing record cancels it |
| Integrity | Unbounded names/spend, invalid categories/dates/URLs, end before start | Zod schemas with limits, enums, ISO dates, date-order checks |
| Workflow | No "start review" step; assignee could review own assessment; answers editable after submit | New endpoint, segregation of duties, locking |
| Workflow | Newly activated vendors had no next review date; cadence setting ignored | Review date derived from tier cadence on activation and on assessment completion |
| Workflow | Document expiry-warning setting ignored (hard-coded 45 days) | Status refresh reads the setting both ways |
| Workflow | Inbox counted your own requests | Excluded server-side |
| Data | Seed clock was 12 h ahead, producing "in 4 hours" audit rows | Seed uses real time |
| Reports | Audit CSV exported only the current page; MTTR counted risk-accepted; renewals list exceeded its 90-day label | Full filtered export; MTTR closed-only; query bounded |
| UX | Double-click created duplicate vendors/approvals | In-flight guards on every submit |
| UX | Renewal panel wording inverted the notice deadline | Rewritten states: window open / deadline passed (auto-renews or expires) / term ended |
| UX | Wizard lost state on browser Back | Step in URL |
| Mobile | Horizontal overflow on most pages at 390/320 px | Table wrapper, header min-width, wrapping action rows, responsive grids |
| A11y | Modals didn't trap or return focus; tables had 11 links per row; no aria-sort; contrast failures; no skip link; identical page titles | All addressed in the UI kit and shell |

## Known limitations (by design for this build)
- Documents store metadata only; there is no file storage or download.
- Single-process SQLite; sessions and throttle counters are in-memory.
- No email delivery; notifications are in-app only.
- Risk-accepted findings require a second admin to approve when raised by the only admin.
