# Knowledge Guardian — Team Task Division & Implementation Plan

**Project:** Knowledge Guardian — Organizational Truth Reconciliation Agent  
**Hackathon:** Tencent Cloud Hackathon Indonesia 2026  
**Track:** Challenge A — The Workplace Brain  
**Team size:** 3 people  
**Document status:** Proposed implementation plan; update owners, progress, and dates as the team works.

## 1. Team structure

| Role | Primary ownership | Main deliverable |
|---|---|---|
| **Person 1 — AI & WorkBuddy Lead** | Agent orchestration, prompting, retrieval collaboration, policy/precedent reasoning, truth reconciliation | Working WorkBuddy agent with traceable tool calls and evidence-grounded output |
| **Person 2 — Backend, Data & Security Lead** | NestJS API, database, ingestion, permissions, secure retrieval, MCP tools, audit | Secure backend, data layer, and MCP tool endpoints |
| **Person 3 — Frontend, UX & Evaluation Lead** | Next.js UI, citations, Decision Trail, feedback screens, test evidence, demo | Usable web app, test report, and demo package |

> **Workload warning:** Person 2 has the heaviest infrastructure responsibility. Person 1 should help build retrieval and policy services. Person 3 should own the evaluation harness, documentation, and demo artifacts to balance the load.

## 2. Responsibilities by owner

### Person 1 — AI & WorkBuddy Lead

- [ ] Validate WorkBuddy ↔ custom MCP tool integration (first technical spike).
- [ ] Define Guardian agent instructions and tool-use policy.
- [ ] Implement intent/context extraction and tool selection.
- [ ] Collaborate on hybrid retrieval and evidence ranking.
- [ ] Define policy authority and temporal-reasoning logic with Person 2.
- [ ] Implement precedent matching and similarity explanation.
- [ ] Implement Organizational Truth Reconciliation output logic.
- [ ] Generate grounded answers with source IDs, assumptions, and uncertainty.
- [ ] Handle missing evidence, prompt injection, and abstention behavior.
- [ ] Document WorkBuddy's actual contribution and capture tool traces.

**Definition of done:** WorkBuddy can invoke authorized backend tools and return structured, cited responses; the reasoning flow can be demonstrated, with no unverified claims of tool integration.

### Person 2 — Backend, Data & Security Lead

- [ ] Create NestJS application and shared API schemas.
- [ ] Setup PostgreSQL, Prisma migrations, and pgvector.
- [ ] Design user, source, chunk, permission, policy, precedent, inquiry, feedback, and audit models.
- [ ] Parse and ingest official sample documents, chat exports, and tasks.
- [ ] Implement authorization filtering **before** retrieval.
- [ ] Enforce permissions when opening evidence, inquiry history, and precedents.
- [ ] Implement source version, effective date, scope, and authority metadata.
- [ ] Build authorized keyword/vector search and source citations.
- [ ] Expose MCP tools: `search_knowledge`, `resolve_policy`, `find_precedents`, `reconcile_truth`, `get_evidence`.
- [ ] Implement audit logging, revocation behavior, and safe feedback validation.
- [ ] Write automated permission and access-revocation tests.

**Definition of done:** Restricted content is not retrieved for unauthorized users, and revoking permissions affects the next request, including evidence/history views.

### Person 3 — Frontend, UX & Evaluation Lead

- [ ] Create Next.js app and design system.
- [ ] Design employee and manager user journeys.
- [ ] Build chat UI with answer, citations, uncertainty, and status.
- [ ] Build source evidence viewer with access-aware error states.
- [ ] Build interactive Decision Trail with evidence per node.
- [ ] Build manager review/feedback screen if time allows.
- [ ] Prepare shared mock JSON responses for parallel frontend development.
- [ ] Create test case tracker and screenshot evidence template.
- [ ] Implement evaluation/reporting UI or a concise test report.
- [ ] Prepare demo storyboard, 5–8-minute recording, and slide/supporting artifacts.
- [ ] Assemble submission materials and README with other members.

**Definition of done:** An end-to-end demo shows an understandable cited answer, accessible evidence, conflict handling, and permission-safe refusal; evidence of actual tests is captured.

## 3. Shared integration contracts — agree before coding

All three members must approve these interfaces first:

1. **Authentication context:** identity and privileges come from verified sessions, never model-generated user IDs.
2. **MCP tool contracts:** input/output schemas, error states, source IDs, allowed scope, timeouts.
3. **Guardian answer schema:** `status`, `answer`, `citations`, `official_truth`, `operational_truth`, `conflicts`, `assumptions`, `decision_trail`, `limitations`.
4. **Evidence object:** source ID, chunk ID, title, excerpt, type, timestamps, current ACL check.
5. **Case and policy model:** status, authority, validity window, supersession, structured matching factors.
6. **Audit requirements:** query, authorized retrieval IDs, output, denial/abstention, actor and timestamps; avoid unnecessary sensitive contents.

**Shared vertical slice:** User question → verified permission → authorized retrieval → WorkBuddy tools → grounded answer → evidence viewer → audit.

## 4. Milestones and ownership

| Milestone | Person 1 — AI | Person 2 — Backend | Person 3 — Frontend |
|---|---|---|---|
| **M0: Foundation / Integration spike** | Test WorkBuddy + MCP; agent/tool schemas | Repo, DB, basic auth/ACL, mock dataset | Wireframes, design system, mock answer cards |
| **M1: Trusted Answer** | Tool calls, cited answer, source conflict explanation | Ingestion, secure retrieval, source resolution, audit | Chat, citation viewer, status/error UI |
| **M2: Truth Reconciliation** | Policy/precedent reasoning, reconciliation | Claims and cases, deterministic policy checks | Decision Trail, policy-vs-practice comparison |
| **M3: Feedback & Hardening** | Abstention, prompt-injection tests | Access revocation, feedback authorization, security tests | Review UI, usability and accessibility tests |
| **M4: Evaluation & Demo** | AI correctness and WorkBuddy trace evidence | Security/performance test evidence | Results, screenshots, demo, submission package |

## 5. Suggested 7-day sprint (aggressive example)

| Day | Goal | Exit check |
|---|---|---|
| **1** | Setup, schema agreement, WorkBuddy integration spike | Agent invokes a mock authorized MCP tool |
| **2–3** | Complete basic Challenge A flow | Fuel allowance conflict answer with two citations; permission gate works |
| **4–5** | Implement innovation feature | Official vs operational truth and policy–practice gap visible |
| **6** | Security, revocation, injection, evaluation | Critical tests run and failures documented |
| **7** | Stabilize and package demo/submission | End-to-end demo, screenshots, README, accountability sheet |

If the schedule is compressed, **defer advanced feedback UI and dashboard**. Do **not** defer permission checks, safe refusal, citations, or audit logging.

## 6. Deliverable PIC matrix

| Hackathon deliverable | Primary PIC | Review/support |
|---|---|---|
| Project title and short blurb | Person 3 | All |
| Project description | Person 3 | Persons 1 & 2 |
| Accountability sheet (one page) | Person 2 | All |
| Architecture diagram and trust boundaries | Person 2 | Person 1 |
| Test results + screenshots, including failures | Person 3 | Persons 1 & 2 |
| Demo video (5–8 minutes) | Person 3 | All |
| WorkBuddy product sharing / lessons learned | Person 1 | Person 3 |
| Public code repository or WorkBuddy workflow export | Person 2 | All |
| Optional cover image | Person 3 | All |
| Optional live demo URL | Person 2 | Person 3 |

## 7. Three required demo scenarios

### A. Conflicting knowledge

**Question:** “Berapa tunjangan bensin bulanan yang berlaku?”  
**Sources:** Old SOP Rp500.000; newer authorized HR notice Rp750.000.  
**Expected:** Rp750.000, both citations, explanation that the SOP is outdated. The system must verify the notice's authority rather than blindly prefer recency.

### B. Restricted project

**Question:** “Apa perkembangan Proyek Kenari?” from an unauthorized employee.  
**Expected:** The response does not disclose or imply the existence of restricted information and behaves like a query for a non-existent project. No unauthorized retrieval.

### C. Organizational truth reconciliation

**Question:** “Siapa yang berwenang menyetujui renewal SaaS Rp180 juta, dan bagaimana kasus serupa ditangani sebelumnya?”  
**Sources:** Current policy requires Director; mock history has 23 of 26 comparable cases approved by VP.  
**Expected:** Director remains the formal requirement; precedent patterns appear separately; a policy–practice gap is flagged with supporting evidence. No unauthorized approval is executed.

*Values above are handbook/example or synthetic scenario values, not measured product results.*

## 8. Coordination rules

- [ ] Daily integration: merge a working vertical slice rather than isolated modules at the end.
- [ ] One accountable owner per feature; at least one reviewer for security-sensitive PRs.
- [ ] Agree on shared TypeScript/JSON schemas before frontend and agent implementation.
- [ ] Track bugs using severity: **critical** (leak/authorization), **high** (incorrect grounded answer), **medium** (UX/format), **low** (polish).
- [ ] Run permission tests after any change to retrieval, caches, citations, or case history.
- [ ] No fabricated benchmark metrics or claim of a completed WorkBuddy integration without a working trace.
- [ ] All three team members rehearse the surprise-test flow and understand product limitations.

## 9. Final MVP acceptance checklist

- [ ] Answers in Indonesian, English, and mixed language with traceable sources.
- [ ] Permission checked before search; revocation applies to next query.
- [ ] Restricted queries reveal no sensitive existence hints.
- [ ] Conflicting sources identified and evidence-backed source selected.
- [ ] Unknown answers result in abstention and appropriate escalation when authorized.
- [ ] Each query, retrieved source set, and response is auditable.
- [ ] Source content cannot override agent instructions (prompt-injection defense).
- [ ] Multi-source answer can synthesize document, chat, and task.
- [ ] Truth reconciliation clearly separates official rule and historical practice.
- [ ] WorkBuddy's actual tool usage is visible and demonstrable.
- [ ] Test outcomes and screenshots are honest and reproducible.

---

**Recommended execution order:** WorkBuddy MCP spike → secure data ingestion/retrieval → one cited answer → truth reconciliation → Decision Trail → feedback and polishing → tests and submission.
