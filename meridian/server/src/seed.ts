import { db, migrate, insert, run, all, get, update } from "./db.js";
import { hashPassword } from "./auth.js";
import { computeInherentRisk, tierFromInherent, computeAssessmentScore, ratingFromScore, recomputeVendorRisk } from "./risk.js";

let seedState = 20261101;
function rand() { seedState = (seedState * 1103515245 + 12345) & 0x7fffffff; return seedState / 0x7fffffff; }
const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
const int = (a: number, b: number) => a + Math.floor(rand() * (b - a + 1));
const NOW = new Date(Date.now() - 60_000);
const daysFromNow = (d: number) => { const x = new Date(NOW); x.setUTCDate(x.getUTCDate() + d); return x.toISOString().slice(0, 10); };
const tsFromNow = (d: number, h = 0) => { const x = new Date(NOW); x.setUTCDate(x.getUTCDate() + d); x.setUTCHours(x.getUTCHours() + h); return x.toISOString().replace("T", " ").slice(0, 19); };

const USERS = [
  { name: "Avery Chen", email: "avery.chen@meridian.example", role: "admin", department: "Risk & Compliance", title: "Head of Third-Party Risk" },
  { name: "Jordan Patel", email: "jordan.patel@meridian.example", role: "risk_analyst", department: "Risk & Compliance", title: "Senior Risk Analyst" },
  { name: "Priya Raman", email: "priya.raman@meridian.example", role: "risk_analyst", department: "Information Security", title: "Security Assurance Analyst" },
  { name: "Marcus Lee", email: "marcus.lee@meridian.example", role: "procurement", department: "Procurement", title: "Procurement Manager" },
  { name: "Sofia Martinez", email: "sofia.martinez@meridian.example", role: "procurement", department: "Procurement", title: "Category Lead, Technology" },
  { name: "Daniel Okafor", email: "daniel.okafor@meridian.example", role: "vendor_owner", department: "Engineering", title: "Platform Engineering Lead" },
  { name: "Hannah Weiss", email: "hannah.weiss@meridian.example", role: "vendor_owner", department: "Finance", title: "Finance Systems Manager" },
  { name: "Liam O'Connor", email: "liam.oconnor@meridian.example", role: "vendor_owner", department: "People Operations", title: "HRIS Manager" },
  { name: "Grace Kim", email: "grace.kim@meridian.example", role: "auditor", department: "Internal Audit", title: "IT Audit Manager" },
  { name: "Noah Fischer", email: "noah.fischer@meridian.example", role: "vendor_owner", department: "Marketing", title: "MarTech Lead" },
];

const VENDORS: Array<[string, string, string, string, string, number, string, string]> = [
  ["Nimbus Cloud Services", "Cloud Infrastructure", "United States", "restricted", "active", 2400000, "Primary IaaS provider hosting production workloads and customer data.", "Compute, object storage, managed Kubernetes"],
  ["Stratos Compute", "Cloud Infrastructure", "Ireland", "confidential", "active", 640000, "Secondary region hosting for EU data residency.", "EU-region compute and storage"],
  ["PayCore Systems", "Payments", "United Kingdom", "restricted", "active", 1850000, "Payment processing gateway for all card transactions.", "Card acquiring, tokenization, fraud scoring"],
  ["Ledgerly", "Payments", "United States", "confidential", "active", 310000, "Accounts payable automation and invoice matching.", "AP automation"],
  ["SentinelGuard", "Security", "United States", "restricted", "active", 520000, "Managed detection and response (MDR) provider.", "24x7 SOC, EDR management"],
  ["CipherVault", "Security", "Israel", "restricted", "active", 280000, "Secrets management and HSM-backed key custody.", "KMS, HSM"],
  ["Helix Analytics", "Data & Analytics", "United States", "confidential", "active", 420000, "Product analytics and event pipeline.", "Event ingestion, dashboards"],
  ["DataForge", "Data & Analytics", "Canada", "confidential", "active", 195000, "Data warehouse and transformation tooling.", "Warehouse, ELT"],
  ["PeopleFirst HR", "HR & Payroll", "United States", "restricted", "active", 390000, "Core HRIS and payroll for all employees.", "HRIS, payroll, benefits admin"],
  ["TalentBridge", "HR & Payroll", "Netherlands", "confidential", "active", 88000, "Applicant tracking and recruiting workflow.", "ATS"],
  ["Atlas Consulting Group", "Professional Services", "United States", "internal", "active", 760000, "Implementation partner for ERP migration.", "Consulting, staff augmentation"],
  ["Brightline Legal LLP", "Legal", "United Kingdom", "confidential", "active", 240000, "Outside counsel for commercial contracts and privacy.", "Legal services"],
  ["QuickShip Logistics", "Logistics", "United States", "internal", "active", 1120000, "Fulfillment and last-mile delivery for hardware kits.", "Warehousing, shipping"],
  ["Orbit Marketing Cloud", "Marketing", "United States", "confidential", "active", 215000, "Email and lifecycle marketing automation.", "Marketing automation, CDP"],
  ["Beacon Facilities", "Facilities", "United States", "none", "active", 480000, "Office cleaning, maintenance and physical security staffing.", "Facilities management"],
  ["IronPeak Hardware", "Hardware", "Taiwan", "none", "active", 930000, "Laptop and peripheral supplier.", "Hardware procurement"],
  ["Northwind SaaS", "SaaS", "United States", "internal", "active", 64000, "Internal wiki and documentation platform.", "Knowledge management"],
  ["Cadence Collaboration", "SaaS", "United States", "confidential", "active", 172000, "Team messaging and video conferencing.", "Collaboration suite"],
  ["Summit CRM", "SaaS", "United States", "confidential", "active", 345000, "Customer relationship management.", "CRM"],
  ["Veritas Identity", "Security", "United States", "restricted", "active", 198000, "Workforce identity provider and SSO.", "IdP, MFA, SSO"],
  ["Relay Support Desk", "SaaS", "Australia", "confidential", "active", 96000, "Customer support ticketing.", "Helpdesk"],
  ["Polaris Observability", "Cloud Infrastructure", "United States", "internal", "active", 156000, "Logging, metrics and tracing platform.", "Observability"],
  ["Granite Backup", "Cloud Infrastructure", "Germany", "confidential", "active", 72000, "Offsite backup and disaster recovery.", "Backup/DR"],
  ["Lumen Creative Studio", "Marketing", "United States", "none", "active", 58000, "Brand design and creative production.", "Design agency"],
  ["Keystone Audit Partners", "Professional Services", "United States", "confidential", "active", 180000, "External SOC 2 auditor.", "Audit services"],
  ["Harbor Translation", "Professional Services", "Spain", "internal", "active", 24000, "Localization and translation services.", "Translation"],
  ["Zenith Print Co", "Facilities", "United States", "none", "active", 18000, "Managed print services.", "Print"],
  ["Vector Pen Testing", "Security", "United Kingdom", "restricted", "active", 95000, "Annual penetration testing.", "Pen testing, red team"],
  ["Evergreen Benefits", "HR & Payroll", "United States", "restricted", "under_review", 210000, "Employee benefits administration.", "Benefits"],
  ["Cobalt Data Labs", "Data & Analytics", "India", "confidential", "under_review", 140000, "Offshore data labeling and annotation.", "Data labeling"],
  ["FlowState Automation", "SaaS", "United States", "internal", "onboarding", 42000, "Workflow automation and integrations.", "iPaaS"],
  ["Meridian Insights Co", "Data & Analytics", "United States", "confidential", "onboarding", 120000, "Market intelligence data feeds.", "Data feeds"],
  ["Skyline Travel Desk", "Professional Services", "United States", "internal", "onboarding", 65000, "Corporate travel management.", "Travel"],
  ["Aurora AI Platform", "SaaS", "United States", "restricted", "prospect", 300000, "LLM API platform for product features.", "AI/ML APIs"],
  ["Tidewater Staffing", "Professional Services", "United States", "internal", "prospect", 150000, "Contract engineering staffing.", "Staffing"],
  ["Redwood eSign", "SaaS", "United States", "confidential", "prospect", 36000, "Electronic signature platform.", "eSignature"],
  ["Pinnacle Telecom", "Facilities", "United States", "none", "offboarding", 110000, "Legacy office telephony — being replaced.", "Telephony"],
  ["Oldline Storage Inc", "Cloud Infrastructure", "United States", "confidential", "terminated", 0, "Former archival storage vendor — contract ended.", "Archival storage"],
  ["Crescent Payroll (Legacy)", "HR & Payroll", "United States", "restricted", "terminated", 0, "Replaced by PeopleFirst HR.", "Payroll"],
  ["Bluefin Security Consulting", "Security", "Canada", "confidential", "active", 76000, "vCISO and policy advisory.", "Advisory"],
];

const TEMPLATES = [
  {
    name: "Security & Privacy Due Diligence", framework: "SIG Lite / ISO 27001", description: "Baseline information security and data protection questionnaire for vendors with access to internal, confidential or restricted data.",
    questions: [
      ["Governance", "Does the vendor maintain a documented information security policy approved by management and reviewed at least annually?", 2],
      ["Governance", "Is there a named individual accountable for information security (e.g., CISO)?", 1],
      ["Governance", "Does the vendor hold a current SOC 2 Type II or ISO 27001 certification covering the in-scope services?", 3],
      ["Access Control", "Is multi-factor authentication enforced for all administrative and remote access?", 3],
      ["Access Control", "Are access rights reviewed at least quarterly and revoked within 24 hours of termination?", 2],
      ["Access Control", "Is role-based access control implemented following least-privilege principles?", 2],
      ["Data Protection", "Is customer data encrypted at rest using AES-256 or equivalent?", 3],
      ["Data Protection", "Is data encrypted in transit using TLS 1.2 or higher?", 3],
      ["Data Protection", "Does the vendor support data segregation between customers in multi-tenant environments?", 2],
      ["Data Protection", "Is customer data returned or securely destroyed within 30 days of contract termination?", 2],
      ["Vulnerability Management", "Are penetration tests performed by an independent third party at least annually?", 2],
      ["Vulnerability Management", "Are critical vulnerabilities remediated within 15 days of discovery?", 2],
      ["Incident Response", "Does the vendor have a tested incident response plan?", 2],
      ["Incident Response", "Will the vendor notify us of a security incident affecting our data within 24 hours?", 3],
      ["Business Continuity", "Does the vendor maintain and annually test a business continuity and disaster recovery plan?", 2],
      ["Business Continuity", "Is a recovery time objective (RTO) of 4 hours or better committed for in-scope services?", 1],
      ["Privacy", "Does the vendor process personal data only under a signed Data Processing Agreement?", 3],
      ["Privacy", "Are sub-processors disclosed and are we notified of changes in advance?", 2],
      ["Privacy", "Does the vendor support data subject rights requests (access, deletion) within statutory deadlines?", 1],
      ["Personnel", "Do employees with access to customer data complete background checks and annual security training?", 1],
    ],
  },
  {
    name: "Financial Viability Review", framework: "Internal", description: "Assesses the financial stability and continuity risk of strategic and critical suppliers.",
    questions: [
      ["Financials", "Has the vendor provided audited financial statements for the last two fiscal years?", 2],
      ["Financials", "Is the vendor profitable or sufficiently funded for at least 18 months of runway?", 3],
      ["Financials", "Is revenue concentration limited such that no single customer exceeds 25% of revenue?", 1],
      ["Ownership", "Is the ownership structure transparent, with no undisclosed beneficial owners?", 2],
      ["Ownership", "Has the vendor been free of material litigation, liens or regulatory actions in the last 3 years?", 2],
      ["Insurance", "Does the vendor carry cyber liability insurance of at least $5M?", 2],
      ["Insurance", "Does the vendor carry general and professional liability coverage meeting contract minimums?", 1],
      ["Continuity", "Does the vendor offer source-code or data escrow for critical services?", 1],
      ["Continuity", "Is there a documented exit/transition plan in the event of vendor failure?", 2],
      ["Dependencies", "Are the vendor's own critical sub-suppliers identified and managed?", 1],
    ],
  },
  {
    name: "Operational Resilience & BCP", framework: "DORA / ISO 22301", description: "Business continuity, disaster recovery and operational resilience questionnaire for critical service providers.",
    questions: [
      ["BCP", "Is a business continuity plan documented, approved and reviewed annually?", 2],
      ["BCP", "Has the BCP been exercised in the last 12 months with results documented?", 2],
      ["DR", "Are production systems replicated to a geographically separate region?", 3],
      ["DR", "Are backups tested for restoration at least quarterly?", 2],
      ["DR", "Is the committed RPO 1 hour or better?", 1],
      ["Resilience", "Has the vendor had fewer than 2 unplanned outages exceeding 4 hours in the past year?", 2],
      ["Resilience", "Is service availability of 99.9% or higher contractually committed with service credits?", 2],
      ["Resilience", "Does the vendor publish a status page and provide proactive incident communications?", 1],
      ["Concentration", "Can the service be migrated to an alternate provider within 90 days?", 1],
      ["Concentration", "Does the vendor avoid single points of failure in staffing for our account?", 1],
    ],
  },
];

const FINDING_TITLES: Array<[string, string, string]> = [
  ["MFA not enforced for vendor support staff", "Vendor confirmed that tier-1 support staff can access the admin console with password only.", "high"],
  ["SOC 2 report contains unresolved exceptions in change management", "Two exceptions noted in CC8.1 regarding untested emergency changes.", "medium"],
  ["Sub-processor list not published", "The vendor could not provide a current list of sub-processors handling our data.", "medium"],
  ["Penetration test older than 12 months", "Most recent external pen test was dated more than 14 months ago.", "medium"],
  ["Data retention after termination exceeds 30 days", "Vendor retains backups for 90 days post-termination with no deletion certificate.", "high"],
  ["No cyber liability insurance evidence", "Certificate of insurance on file has lapsed; renewal not provided.", "low"],
  ["Encryption at rest not enabled for log archives", "Historical logs containing customer identifiers stored unencrypted in cold storage.", "critical"],
  ["Incident notification SLA is 72 hours", "Contract specifies 72h notification; policy requires 24h.", "high"],
  ["Background checks not performed for contractors", "Offshore contractors with data access are not background checked.", "high"],
  ["DR test not performed in last year", "Vendor's last DR exercise was 19 months ago.", "medium"],
  ["Single-region deployment", "Service runs in a single availability zone with no failover.", "high"],
  ["Access reviews performed annually only", "Policy requires quarterly access recertification.", "low"],
  ["Shared admin credentials observed", "Evidence shows a shared root account used by the operations team.", "critical"],
  ["DPA not executed", "Vendor processes employee personal data without a signed DPA.", "high"],
  ["Vulnerability remediation SLA exceeds 30 days", "Critical CVEs remediated in 45 days on average.", "medium"],
  ["Status page not provided", "No proactive incident communications; outages discovered by our team.", "low"],
  ["Financial statements not provided", "Vendor declined to provide audited financials; D&B score indicates elevated risk.", "medium"],
  ["Key-person dependency on account team", "Single engineer supports our integration with no documented backup.", "low"],
];

export function seed() {
  migrate();
  const userIds: number[] = [];
  for (const u of USERS) userIds.push(insert("users", { ...u, password: hashPassword("Meridian!2026") }));
  const byRole = (r: string) => USERS.map((u, i) => ({ ...u, id: userIds[i] })).filter((u) => u.role === r).map((u) => u.id);
  const owners = byRole("vendor_owner");
  const analysts = byRole("risk_analyst");
  const procurement = byRole("procurement");
  const admin = userIds[0];
  const analyst = (i: number) => analysts[i % analysts.length];

  const templateIds: number[] = [];
  for (const t of TEMPLATES) {
    const { questions, ...rest } = t;
    const id = insert("assessment_templates", rest);
    questions.forEach((q, i) => insert("template_questions", { template_id: id, section: q[0], text: q[1], weight: q[2], sort_order: i }));
    templateIds.push(id);
  }

  const vendorIds: number[] = [];
  const CONTACT_FIRST = ["Elena", "Raj", "Tom", "Mei", "Lucas", "Fatima", "Oscar", "Nadia", "Ben", "Yuki", "Sam", "Ivy"];
  const CONTACT_LAST = ["Rossi", "Kapoor", "Nguyen", "Schulz", "Brown", "Haddad", "Silva", "Ivanova", "Carter", "Tanaka", "Dubois", "Murphy"];
  VENDORS.forEach((v, i) => {
    const [name, category, country, data_access, status, annual_spend, description, services] = v;
    const inherent = computeInherentRisk({ data_access, annual_spend, category });
    const createdDaysAgo = int(60, 900);
    const id = insert("vendors", {
      name, legal_name: `${name}${pick([" Inc.", " Ltd.", " LLC", " GmbH", " B.V.", ""])}`, category, website: `https://www.${name.toLowerCase().replace(/[^a-z0-9]+/g, "")}.example`,
      country, status, tier: tierFromInherent(inherent), inherent_risk: inherent, residual_risk: inherent, data_access, annual_spend,
      owner_id: owners[i % owners.length], description, services,
      next_review_date: status === "active" ? daysFromNow(int(-40, 320)) : null,
      onboarded_at: ["active", "under_review", "offboarding", "terminated"].includes(status) ? tsFromNow(-createdDaysAgo + 14) : null,
      created_at: tsFromNow(-createdDaysAgo), updated_at: tsFromNow(-int(0, 30)),
    });
    vendorIds.push(id);
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "");
    const n = int(1, 3);
    for (let c = 0; c < n; c++) {
      const first = pick(CONTACT_FIRST), last = pick(CONTACT_LAST);
      insert("vendor_contacts", { vendor_id: id, name: `${first} ${last}`, email: `${first.toLowerCase()}.${last.toLowerCase()}@${slug}.example`, phone: `+1 ${int(200, 999)}-${int(200, 999)}-${int(1000, 9999)}`, role: c === 0 ? "Account Manager" : pick(["Security Lead", "Legal Counsel", "Customer Success", "Billing"]), is_primary: c === 0 ? 1 : 0 });
    }
  });
  const vendor = (i: number) => ({ id: vendorIds[i], ...VENDORS[i] });

  let ctrN = 0;
  const addContract = (vi: number, title: string, type: string, value: number, start: number, end: number, extra: Record<string, unknown> = {}) => {
    ctrN++;
    const endDate = daysFromNow(end);
    let status = (extra.status as string) ?? "active";
    if (status === "active" && end < 0) status = "expired";
    else if (status === "active" && end <= 60) status = "expiring";
    return insert("contracts", {
      vendor_id: vendorIds[vi], title, contract_number: `CTR-${2024 + Math.floor(ctrN / 40)}-${String(ctrN).padStart(4, "0")}`, type, value, currency: "USD",
      start_date: daysFromNow(start), end_date: endDate, auto_renew: extra.auto_renew ?? (rand() < 0.5 ? 1 : 0), renewal_notice_days: pick([30, 60, 90]),
      owner_id: pick(procurement), notes: extra.notes ?? null, status, created_at: tsFromNow(start - int(10, 40)),
    });
  };
  const contractIds: Record<number, number[]> = {};
  VENDORS.forEach((v, i) => {
    const [name, category, , , status, spend] = v;
    if (["prospect"].includes(status)) return;
    const ids: number[] = [];
    if (status === "terminated") { ids.push(addContract(i, `${name} Master Services Agreement`, "msa", spend || 150000, -900, -120)); contractIds[i] = ids; return; }
    if (status === "onboarding") { ids.push(addContract(i, `${name} Master Services Agreement`, "msa", spend, 0, 365, { status: "draft" })); if (rand() < 0.6) ids.push(addContract(i, `${name} Mutual NDA`, "nda", 0, -20, 710, { status: "active" })); contractIds[i] = ids; return; }
    const start = -int(120, 700);
    const msaEnd = int(-10, 540);
    ids.push(addContract(i, `${name} Master Services Agreement`, ["Cloud Infrastructure", "SaaS", "Data & Analytics", "Security"].includes(category) ? "saas" : ["Professional Services", "Legal", "Facilities", "Logistics"].includes(category) ? "services" : "msa", spend, start, msaEnd, { notes: `Annual commitment with ${pick(["net-30", "net-45", "net-60"])} payment terms.` }));
    if (rand() < 0.75) ids.push(addContract(i, `${name} Mutual NDA`, "nda", 0, start - 30, start + 1065));
    if (["restricted", "confidential"].includes(v[3]) && rand() < 0.8) ids.push(addContract(i, `${name} Data Processing Agreement`, "dpa", 0, start, msaEnd));
    if (rand() < 0.45) ids.push(addContract(i, `${name} SOW #${int(1, 4)} — ${pick(["Implementation", "Migration", "Managed Services", "Integration", "Training"])}`, "sow", Math.round(spend * (0.1 + rand() * 0.4)), int(-200, -30), int(20, 240)));
    contractIds[i] = ids;
  });
  const OBLIGATIONS = ["Provide updated SOC 2 Type II report", "Quarterly business review", "Annual security questionnaire response", "Renewal pricing notice due", "Certificate of insurance renewal", "Deliver DR test summary", "Sub-processor list update", "Service credit reconciliation"];
  for (const [vi, ids] of Object.entries(contractIds)) {
    const main = ids[0];
    const c = get<any>("SELECT * FROM contracts WHERE id = ?", main)!;
    if (!["active", "expiring"].includes(c.status)) continue;
    const n = int(1, 4);
    for (let k = 0; k < n; k++) {
      const due = int(-60, 150);
      insert("contract_obligations", { contract_id: main, description: pick(OBLIGATIONS), due_date: daysFromNow(due), status: due < -10 ? pick(["met", "met", "missed"]) : "pending", owner_id: pick([...procurement, ...owners]) });
    }
    void vi;
  }

  const DOC_TYPES_BY_ACCESS: Record<string, string[]> = {
    restricted: ["soc2", "iso27001", "pen_test", "insurance", "dpa", "policy"],
    confidential: ["soc2", "insurance", "dpa", "pen_test"],
    internal: ["insurance", "soc2", "policy"],
    none: ["insurance", "financial"],
  };
  const DOC_NAMES: Record<string, string> = { soc2: "SOC 2 Type II Report", iso27001: "ISO 27001 Certificate", insurance: "Certificate of Insurance", pen_test: "External Penetration Test Summary", dpa: "Executed Data Processing Agreement", financial: "Audited Financial Statements", policy: "Information Security Policy", other: "Supporting Document" };
  VENDORS.forEach((v, i) => {
    if (["prospect"].includes(v[4])) return;
    const types = DOC_TYPES_BY_ACCESS[v[3]];
    for (const t of types) {
      if (rand() < 0.2) continue;
      const issued = -int(30, 400);
      const expiry = t === "dpa" ? null : issued + (t === "soc2" || t === "pen_test" ? 365 : t === "iso27001" ? 1095 : 365);
      const fy = 2026 + Math.floor((issued + 60) / 365);
      insert("documents", {
        vendor_id: vendorIds[i], contract_id: contractIds[i]?.[0] ?? null, name: `${DOC_NAMES[t]} ${t === "dpa" ? "" : "FY" + fy}`.trim(), type: t,
        status: expiry == null ? "valid" : expiry < 0 ? "expired" : expiry <= 45 ? "expiring" : rand() < 0.08 ? "pending_review" : "valid",
        issued_date: daysFromNow(issued), expiry_date: expiry == null ? null : daysFromNow(expiry),
        file_name: `${v[0].replace(/[^A-Za-z0-9]+/g, "_")}_${t}_${fy}.pdf`, file_size: int(180, 4200) * 1024, uploaded_by: pick([...analysts, ...procurement]), created_at: tsFromNow(issued + int(1, 10)),
      });
    }
  });

  const ANSWER_WEIGHTS = (quality: number) => (rand() < quality ? "yes" : rand() < 0.5 ? "partial" : rand() < 0.85 ? "no" : "na");
  const assessmentIds: number[] = [];
  VENDORS.forEach((v, i) => {
    const [name, , , access, status, spend] = v;
    if (status === "prospect") return;
    const t = access === "none" ? [templateIds[1]] : access === "internal" ? [templateIds[0]] : spend > 300000 ? [templateIds[0], templateIds[2], templateIds[1]] : [templateIds[0], templateIds[1]];
    const quality = { restricted: 0.78, confidential: 0.72, internal: 0.68, none: 0.7 }[access] ?? 0.7;
    t.forEach((tid, ti) => {
      const tmpl = TEMPLATES[templateIds.indexOf(tid)];
      let aStatus: string;
      if (status === "onboarding") aStatus = ti === 0 ? pick(["in_progress", "submitted"]) : "not_started";
      else if (status === "under_review") aStatus = ti === 0 ? "under_review" : "completed";
      else if (status === "terminated") aStatus = "completed";
      else aStatus = ti === 0 ? pick(["completed", "completed", "completed", "in_progress", "submitted"]) : pick(["completed", "completed", "not_started", "in_progress"]);
      const created = aStatus === "completed" ? -int(30, 400) : -int(3, 60);
      const id = insert("assessments", {
        vendor_id: vendorIds[i], template_id: tid, title: `${tmpl.name} — ${name}`, status: aStatus, assigned_to: analyst(i + ti), reviewer_id: aStatus === "not_started" ? null : admin,
        due_date: daysFromNow(aStatus === "completed" ? created + 45 : int(-10, 45)), created_at: tsFromNow(created),
        submitted_at: ["submitted", "under_review", "completed"].includes(aStatus) ? tsFromNow(created + int(10, 25)) : null,
        completed_at: aStatus === "completed" ? tsFromNow(created + int(26, 40)) : null,
        summary: aStatus === "completed" ? pick(["Controls are generally well designed and operating; residual gaps tracked as findings.", "Vendor demonstrates mature security posture. No critical gaps identified.", "Several control gaps identified; remediation plan agreed with vendor.", "Adequate for current data classification. Re-assess on scope change."]) : null,
      });
      assessmentIds.push(id);
      if (aStatus !== "not_started") {
        const qs = all<{ id: number }>("SELECT id FROM template_questions WHERE template_id = ?", tid);
        const answerCount = aStatus === "in_progress" ? int(Math.floor(qs.length * 0.3), qs.length - 1) : qs.length;
        qs.slice(0, answerCount).forEach((q) => insert("assessment_answers", { assessment_id: id, question_id: q.id, answer: ANSWER_WEIGHTS(quality), note: rand() < 0.3 ? pick(["Evidence attached in SOC 2 report.", "Confirmed on vendor call.", "Vendor to provide policy document.", "Partial — applies to primary region only."]) : null }));
        const score = computeAssessmentScore(id);
        update("assessments", id, { score, risk_rating: ratingFromScore(score) });
      }
    });
  });

  let fIdx = 0;
  VENDORS.forEach((v, i) => {
    const [name, , , access, status] = v;
    if (status === "prospect") return;
    const count = access === "restricted" ? int(2, 4) : access === "confidential" ? int(1, 3) : int(0, 2);
    const vendorAssessments = all<{ id: number }>("SELECT id FROM assessments WHERE vendor_id = ? AND status = 'completed'", vendorIds[i]);
    for (let k = 0; k < count; k++) {
      const f = FINDING_TITLES[fIdx++ % FINDING_TITLES.length];
      const created = -int(5, 200);
      const fStatus = created < -120 ? pick(["closed", "closed", "risk_accepted", "in_remediation"]) : pick(["open", "open", "in_remediation", "closed"]);
      const resolved = ["closed", "risk_accepted"].includes(fStatus);
      insert("findings", {
        vendor_id: vendorIds[i], assessment_id: vendorAssessments.length ? pick(vendorAssessments).id : null, title: f[0], description: `${f[1]} (${name})`, severity: f[2], status: fStatus,
        owner_id: owners[i % owners.length], due_date: daysFromNow(created + (f[2] === "critical" ? 30 : f[2] === "high" ? 60 : 90)),
        remediation_plan: fStatus === "open" ? null : pick(["Vendor committed to remediation in next quarterly release.", "Contract amendment in negotiation to address gap.", "Compensating control implemented on our side; monitoring in place.", "Vendor provided updated evidence; verified by analyst."]),
        created_at: tsFromNow(created), resolved_at: resolved ? tsFromNow(created + int(10, 60)) : null,
      });
    }
  });

  const approvalRows: Array<Record<string, unknown>> = [];
  VENDORS.forEach((v, i) => {
    const [name, category, , , status] = v;
    const vid = vendorIds[i];
    if (status === "onboarding") approvalRows.push({ type: "vendor_onboarding", entity_type: "vendor", entity_id: vid, title: `Onboard ${name}`, description: `Approve ${name} (${category}) as an active vendor.`, requested_by: pick(procurement), status: "pending", priority: pick(["normal", "high"]), created_at: tsFromNow(-int(1, 12)) });
    if (status === "offboarding") approvalRows.push({ type: "offboarding", entity_type: "vendor", entity_id: vid, title: `Offboard ${name}`, description: `Terminate relationship with ${name}; data return confirmed.`, requested_by: pick(owners), status: "pending", priority: "normal", created_at: tsFromNow(-int(1, 6)) });
    if (["active", "under_review"].includes(status) && rand() < 0.5) {
      const d = -int(20, 300);
      approvalRows.push({ type: "vendor_onboarding", entity_type: "vendor", entity_id: vid, title: `Onboard ${name}`, description: `Approve ${name} (${category}) as an active vendor.`, requested_by: pick(procurement), approver_id: pick([admin, ...analysts]), status: rand() < 0.9 ? "approved" : "rejected", priority: "normal", comment: pick(["Approved — assessment complete, DPA executed.", "Approved with condition: SOC 2 report due within 30 days.", "Approved.", null]), created_at: tsFromNow(d), decided_at: tsFromNow(d + int(1, 5), int(1, 12)) });
    }
  });
  const draftContracts = all<any>("SELECT c.*, v.name AS vendor_name FROM contracts c JOIN vendors v ON v.id = c.vendor_id WHERE c.status = 'draft'");
  for (const c of draftContracts.slice(0, 2)) {
    update("contracts", c.id, { status: "in_review" });
    approvalRows.push({ type: "contract", entity_type: "contract", entity_id: c.id, title: `Contract: ${c.title}`, description: `${c.vendor_name} — ${c.type.toUpperCase()} valued at USD ${Number(c.value).toLocaleString()}`, requested_by: pick(procurement), status: "pending", priority: c.value >= 100000 ? "high" : "normal", created_at: tsFromNow(-int(1, 8)) });
  }
  const openHigh = all<any>("SELECT f.*, v.name AS vendor_name FROM findings f JOIN vendors v ON v.id = f.vendor_id WHERE f.status IN ('open','in_remediation') AND f.severity IN ('high','medium') LIMIT 2");
  for (const f of openHigh) approvalRows.push({ type: "risk_acceptance", entity_type: "finding", entity_id: f.id, title: `Accept risk: ${f.title}`, description: `${f.vendor_name} — ${f.severity} severity.\n\nJustification: Compensating controls in place; vendor remediation scheduled next quarter. Business impact of delay is low.`, requested_by: f.owner_id, status: "pending", priority: f.severity === "high" ? "high" : "normal", created_at: tsFromNow(-int(1, 5)) });
  for (const a of approvalRows) insert("approvals", a);

  const ACTIONS = ["update", "update", "complete", "comment", "comment", "login"];
  const vendorsAll = all<any>("SELECT id, name FROM vendors");
  for (let k = 0; k < 160; k++) {
    const v = pick(vendorsAll);
    const action = pick(ACTIONS);
    const actor = action === "complete" ? pick([admin, ...analysts]) : pick(userIds);
    const summaries: Record<string, string> = {
      create: `Created vendor ${v.name}`, update: `Updated ${v.name} (${pick(["annual_spend", "owner_id", "description", "next_review_date", "data_access"])})`, status_change: `${v.name} status changed ${pick(["prospect → onboarding", "onboarding → active", "active → under_review", "under_review → active"])}`,
      submit: `Submitted ${v.name} for onboarding approval`, approve: `Onboarding approved for ${v.name}`, complete: `Completed review of Security & Privacy Due Diligence — ${v.name}`, comment: `Commented: ${pick(["Following up with vendor on SOC 2 bridge letter.", "Renewal pricing received — 6% uplift.", "Escalated MFA gap to vendor security team.", "Scheduled QBR for next month."])}`, login: `${USERS[userIds.indexOf(actor)].name} signed in`,
    };
    insert("activity_log", { actor_id: actor, action, entity_type: action === "login" ? "user" : action === "complete" ? "assessment" : "vendor", entity_id: action === "login" ? actor : v.id, summary: summaries[action], created_at: tsFromNow(-int(0, 120), -int(0, 23)) });
  }
  const COMMENTS = ["Vendor confirmed remediation target of end of quarter.", "Requested bridge letter to cover the gap period.", "Legal reviewing the DPA redlines.", "Flagging this for the next risk committee.", "Evidence received and attached.", "Renewal conversation scheduled with account manager."];
  for (const f of all<any>("SELECT id FROM findings").slice(0, 25)) for (let k = 0; k < int(0, 3); k++) insert("comments", { entity_type: "finding", entity_id: f.id, author_id: pick(userIds), body: pick(COMMENTS), created_at: tsFromNow(-int(0, 60), -int(0, 20)) });
  for (const a of all<any>("SELECT id FROM assessments").slice(0, 20)) for (let k = 0; k < int(0, 2); k++) insert("comments", { entity_type: "assessment", entity_id: a.id, author_id: pick(userIds), body: pick(COMMENTS), created_at: tsFromNow(-int(0, 60), -int(0, 20)) });
  for (const a of all<any>("SELECT id FROM approvals WHERE status='pending'")) if (rand() < 0.5) insert("comments", { entity_type: "approval", entity_id: a.id, author_id: pick(userIds), body: pick(COMMENTS), created_at: tsFromNow(-int(0, 4), -int(0, 20)) });

  const NOTES: Array<[string, string, string]> = [
    ["Onboarding approval requested", "Marcus Lee requested approval to onboard FlowState Automation", "/approvals"],
    ["Assessment assigned to you", "Security & Privacy Due Diligence — Aurora AI Platform", "/assessments"],
    ["Contract expiring in 30 days", "PayCore Systems Master Services Agreement renews soon", "/contracts"],
    ["Document expired", "SentinelGuard SOC 2 Type II Report has expired", "/documents?status=expired"],
    ["New critical finding", "Encryption at rest not enabled for log archives (Nimbus Cloud Services)", "/findings?severity=critical"],
    ["Review overdue", "3 vendors are past their scheduled risk review date", "/vendors?sort=next_review_date"],
  ];
  for (const uid of userIds) for (const n of NOTES) if (rand() < 0.7) insert("notifications", { user_id: uid, title: n[0], body: n[1], link: n[2], read: rand() < 0.5 ? 1 : 0, created_at: tsFromNow(-int(0, 10), -int(0, 20)) });

  for (const id of vendorIds) recomputeVendorRisk(id);
  run("UPDATE contracts SET status = 'expired' WHERE status IN ('active','expiring') AND end_date < date('now')");
  run("UPDATE contracts SET status = 'expiring' WHERE status = 'active' AND julianday(end_date) - julianday('now') <= renewal_notice_days");
  run("UPDATE documents SET status = 'expired' WHERE status IN ('valid','expiring') AND expiry_date < date('now')");
  run("UPDATE documents SET status = 'expiring' WHERE status = 'valid' AND expiry_date <= date('now', '+45 days')");
  return { users: userIds.length, vendors: vendorIds.length };
}

if (process.argv[1] && process.argv[1].endsWith("seed.ts")) {
  migrate();
  for (const t of ["notifications", "comments", "activity_log", "approvals", "findings", "assessment_answers", "assessments", "template_questions", "assessment_templates", "documents", "contract_obligations", "contracts", "vendor_contacts", "vendors", "sessions", "users", "settings"]) run(`DELETE FROM ${t}`);
  db.exec("DELETE FROM sqlite_sequence");
  const r = seed();
  console.log("[meridian] seeded", r);
}
