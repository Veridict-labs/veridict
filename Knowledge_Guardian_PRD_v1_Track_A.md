TENCENT CLOUD HACKATHON INDONESIA 2026  |  CHALLENGE A — THE WORKPLACE BRAIN

# Knowledge Guardian

PRODUCT REQUIREMENTS DOCUMENT (PRD)  ·  Version 1.0

Trusted Organizational Knowledge Intelligence — Organizational Truth Reconciliation

Status: Proposed / implementation-ready specification. Nothing in this PRD claims a working integration, completed benchmark, or measured business impact.

## Document control

| Field | Decision |
| --- | --- |
| Product | Knowledge Guardian |
| Owner | Product & Engineering Team (to assign) |
| Primary scenario | New employee onboarding: reimbursement, leave, approval authority |
| Additional demo case | SaaS renewal policy vs precedent (synthetic supplement) |
| Primary users | Employees, HR, operations, team leads; authorized policy owners |
| Competition | Tencent Cloud Hackathon Indonesia 2026 — Challenge A |
| Baseline | Competition-Optimized Proposal v5 + official Hackathon Handbook |
| Build decision | Next.js + NestJS + PostgreSQL/pgvector; WorkBuddy tool orchestration (access to verify) |

## 1. Executive summary

Knowledge Guardian turns fragmented company chats, documents and task records into accurate, permission-aware, cited answers. Its differentiation is Organizational Truth Reconciliation: distinguish the currently authorized formal rule (official), validated past actions (operational), and time-specific validity (temporal). A structured evidence trail explains source selection and discrepancies without exposing confidential evidence or hidden model reasoning.

Primary product outcome: employees answer routine workplace questions without repeatedly interrupting senior staff, while maintaining strict access boundaries and auditable responses. This is a workplace knowledge system, not an automated approval, email, procurement, or payment agent.

## 2. Problem, users and value

| Guidebook problem | Product response | Proof |
| --- | --- | --- |
| Knowledge spread across chats, drives, task boards | Permission-filtered multi-source retrieval | Cited answer synthesizes permitted document, chat and task |
| Repeated questions bottleneck senior staff | Self-service bilingual/mixed-language Q&A | Completion of onboarding question and time-to-answer study |
| Sources conflict or grow stale | Authority, scope, supersession and temporal checks | Rp500k SOP vs authorized Rp750k HR update |
| AI can leak salary/private projects | Pre-retrieval ACL + non-disclosing refusal | Restricted Kenari indistinguishable from nonexistent query |
| AI must be accountable | Evidence trace, abstention, audit log | Inspect source IDs, validation status and safe refusal |

## 2.1 Personas

| Persona | Needs | Permissions / constraints |
| --- | --- | --- |
| New employee | Fast answer about reimbursements, leave, approval authority | May view general staff policies; not executive/secret projects |
| HR/Operations specialist | Resolve conflicting instructions and reduce repeat questions | Department-scoped sources and case history |
| Policy owner / manager | Review gaps, validate changes and exceptions | Scoped write approval; not blanket cross-domain authority |
| Admin / evaluator | Ingest test data, assign permissions, review test reports | Administrative actions auditable and separate from employee role |

## 2.2 Job stories

- When I join a company and policies are scattered, I want one cited answer so I can act without repeatedly asking HR.
- When an HR message differs from an old SOP, I want to know which rule currently applies and why.
- When I ask about something confidential, the assistant must not reveal content or even signal that restricted records exist.
- When a formal approval rule differs from observed practice, I want that divergence explained without granting unauthorized permission.
## 3. Goals, non-goals and success

| Area | Requirement |
| --- | --- |
| Goals | Answer multilingual workplace questions with permitted evidence; resolve official conflicts; abstain when evidence is insufficient; preserve auditability; demonstrate differentiated reconciliation. |
| Non-goals | Send email, schedule meetings, approve transactions, move money, autonomously edit policy, fine-tune models online, build production-wide enterprise integrations. |
| MVP success gate | All mandatory guidebook test classes exercised; no unauthorized source disclosed in security suite; every asserted material claim traceable to permitted evidence; one complete Truth Reconciliation demo. |
| Evidence caution | Accuracy, time-saved or productivity claims only published after real tests with denominators, failures and dates. |

## 4. Product scope and release priorities

| ID | Priority | Feature | Acceptance gate |
| --- | --- | --- | --- |
| FR-01 | P0 | Multilingual answers with citations | Indonesian, English, mixed queries; sources identify document/chat/task and exact excerpt |
| FR-02 | P0 | Pre-retrieval permission enforcement | ACL applied before retrieval; no denied snippets passed to model |
| FR-03 | P0 | Revocation and safe refusal | Access change applies next question; restricted vs nonexistent outward result indistinguishable |
| FR-04 | P0 | Conflict/validity/abstention | Explain selected source; unresolved ambiguity yields no invented conclusion; allowed owner escalation |
| FR-05 | P0 | Audit logging | Record user, query metadata, retrieved source IDs, decision status, response and timestamp |
| FR-06 | P0 | Multi-source synthesis | One answer can combine a document, chat and task without ACL breach |
| FR-07 | P1 | Truth Reconciliation | Official, operational and temporal facts separately represented; gap flag justified |
| FR-08 | P1 | Evidence/Decision Trail | Open nodes with source spans, dates, authority and reason codes; reauthorization on click |
| FR-09 | P1 | Validated human feedback | Authorized review required before outcome becomes reusable precedent |
| FR-10 | P2 | Knowledge Change Impact | Mark limited prior inquiries NEEDS_REVALIDATION after approved claim supersession |
| FR-11 | P2 | Evaluation dashboard | Report raw pass/fail, category metrics and baseline comparison with test details |

## 5. Detailed functional requirements

### 5.1 Ask Guardian — user-facing workflow

1. User signs in and receives verified role, department, organization and identity context.
1. User asks free-form question; UI may provide onboarding question suggestions.
1. Backend opens inquiry and creates scoped, authenticated tool context; no user-selected impersonation.
1. Agent chooses appropriate authorized tools; simple question does not force precedent search.
1. Backend filters eligible knowledge before retrieval and validates source visibility before model exposure.
1. Answer returns structured status: ANSWERED | NEEDS_CLARIFICATION | INSUFFICIENT_EVIDENCE | UNAVAILABLE; safe refusal uses generic non-disclosing wording.
1. UI displays answer, citations, conflict status, evidence-sufficiency label and optional trail; all detail views recheck access.
1. System logs the query, evidence IDs, validation outcome and response, limiting retention of sensitive content.
### 5.2 Source authority and time

- Source status: approved, official-internal, informal, draft, superseded, unknown. Status must come from evidence-backed metadata or authorized verification, never from LLM assertion alone.
- Policy claim: domain, predicate, effect, scope, owner, issuer authorization, valid_from, valid_until, recorded_at, supersedes, supporting span and validation status.
- Prefer applicable approved delegated authority after checking scope/date; a recent chat may supersede SOP only when its issuer and update procedure are authorized.
- A tie, missing authority or unresolved conflict is NEEDS_REVIEW; choose abstention/escalation over false confidence.
### 5.3 Truth Reconciliation rules

- Official Truth: applicable supported formal rule. Operational Truth: validated comparable outcomes; never upgraded to policy through frequency alone.
- Temporal Truth: distinguish what was valid at original inquiry time from what applies now; prior answer may require revalidation.
- Current Context: captured case attributes and explicit assumptions; disqualifying differences shown in trail.
- Policy–practice gap: detect only when official obligation and observed behavior are both supported and comparable; recommend policy-owner review, not policy violation.
- Use evidence sufficiency labels (SUPPORTED / PARTIAL / UNRESOLVED), not fabricated percentage confidence.
### 5.4 Human feedback

- Feedback action: confirm, dispute, comment or document exception; submission records PENDING_REVIEW.
- Reviewer must have matching domain and resource authority; only validated feedback can be promoted to reusable DecisionCase.
- An exception or observation never rewrites PolicyClaim automatically. Every promotion creates an audit event.
## 6. Security and accountability requirements

| ID | Control | Enforcement / test |
| --- | --- | --- |
| SEC-01 | Identity and authorization | Derive user from signed session/tool token; tool cannot trust LLM-supplied userId |
| SEC-02 | Filter before retrieval | SQL/ACL prefilter applies to lexical and vector candidates; deny by default |
| SEC-03 | Non-disclosure | Restricted and nonexistent queries share outward response shape, latency target and disclosure-safe metadata |
| SEC-04 | Dynamic revocation | No stale permission in cache; reauthorize sources, inquiries and precedents on each access |
| SEC-05 | Injection boundary | Retrieved content treated as data; no instructions or tool commands from untrusted source |
| SEC-06 | PII masking | Mask NIK and phone fields by default unless explicitly allowed and necessary |
| SEC-07 | Scoped audit | Log source IDs and outcomes; protect logs from unauthorized reads, use retention policy |
| SEC-08 | Human authority | No autonomous publish, approve, email, payment or policy rewrite |
| SEC-09 | Evidence integrity | Citation referential integrity: excerpt maps to persisted source/chunk and permission check |

Acceptance invariant: the AI must never receive denied confidential content. Frontend filtering alone is explicitly unacceptable. A generic non-disclosing answer is required for both unavailable and restricted resources; audit may differentiate internally under appropriate controls.

## 7. Technical architecture

Employee (Next.js)
   | authenticated request
NestJS API: identity / ACL / inquiry / audit
   | scoped tool context (not model-supplied user identity)
WorkBuddy agent --> MCP tools at NestJS
   | search_authorized_knowledge / resolve_policy_claims
   | find_validated_precedents / reconcile_truth / get_evidence
PostgreSQL + pgvector (source metadata / chunks / claims / ACL / cases)
   |
Evidence validator --> answer or abstain --> UI + audit

WorkBuddy integration is a deployment dependency, not an assumed available HTTP API. First verify in the team environment whether a custom MCP connector and/or managed runtime is accessible. If only desktop agent execution is supported, demonstrate real WorkBuddy tool calls while the web application displays synchronized evidence and history; do not misrepresent a separate LLM runtime as WorkBuddy.

### 7.1 Data entities

| Entity | Minimum fields |
| --- | --- |
| User | id, role, department, org_id, active |
| KnowledgeSource | id, type, title, owner, state, issuer, valid_from/to, recorded_at, version, supersedes, ACL |
| SourceChunk | id, source_id, chunk_index, content, span, embedding, integrity_hash |
| Permission | subject, resource_id, action, scope, updated_at, permission_version |
| PolicyClaim | id, domain, predicate, result, authority, status, effective_range, evidence_chunk_id |
| DecisionCase | id, type, context attributes, outcome, authority, reviewed_status, visibility, source_refs |
| Inquiry | id, asker, question, status, answer, evidence_map, trail, permission_version, timestamps |
| FeedbackEvent | id, inquiry_id, action, reason, actor, validation_status, reviewer |
| AuditEvent | id, actor, event_type, resource_refs, decision, timestamp |

### 7.2 API endpoints — proposed

| Verb | Path | Auth / purpose |
| --- | --- | --- |
| POST | /v1/inquiries | Employee: question; creates inquiry and initiates approved agent flow |
| GET | /v1/inquiries/:id | Revalidate requester access and redacted evidence |
| GET | /v1/sources/:id/evidence | Chunk-level evidence read, reauthorized at open time |
| POST | /v1/knowledge/ingest | Admin-only ingestion, source metadata & ACL |
| POST | /v1/feedback | Authorized participant: pending feedback |
| POST | /v1/feedback/:id/validate | Domain reviewer validates/rejects candidate precedent |
| GET | /v1/cases | Only currently permitted precedent visibility |
| GET | /v1/evaluation/reports | Reviewer/admin; anonymized test statistics |
| GET | /v1/audit | Admin with constrained audit-log rights |

### 7.3 MCP tool contracts

| Tool | Input | Output | Safety |
| --- | --- | --- | --- |
| search_authorized_knowledge | query, source_types?, limit? | source_id, chunk_id, excerpt, date, title | Identity from trusted connector/session; ACL prefilter |
| resolve_policy_claims | domain, context, as_of | applicable rule, rejected candidates, reason codes | No LLM-authority shortcut |
| find_validated_precedents | case context, max_results | visible case IDs, similarity factors, outcomes | Case ACL + validated status |
| reconcile_truth | official, practice, time, context | gap flag, supported statements, uncertainty | No operational override of official rule |
| get_evidence | source/chunk ID | authorized exact excerpt and provenance | Reauthorize per open |
| submit_feedback (P1) | inquiry ID, proposed decision, reason | pending event ID | Human review required before publication |

### 7.4 Implementation algorithm

1  Validate session; derive actor and effective resource scope
2  Plan tools from question; do not let model modify actor scope
3  Retrieve permitted text via SQL ACL + hybrid lexical/vector search
4  Normalize candidate claims to schema; validate against source metadata
5  Resolve current approved scope, authority and supersession
6  If needed: retrieve case-level authorized validated precedents
7  Reconcile official / operational / temporal evidence
8  Verify every material claim -> accessible evidence IDs
9  Answer with citations OR abstain; persist scoped audit

## 8. User experience and product states

| Screen | Key elements | Edge cases |
| --- | --- | --- |
| Ask Guardian | Prompt, language-agnostic input, question suggestions, answer, expandable sources | Missing source; conflict; denied content; ambiguous query |
| Evidence Trail | Official evidence, conflict reason codes, source provenance, precedent comparison | Source access revoked after response: deny evidence open |
| Manager Review | Pending feedback, source/authority context, approve/dispute action | Role/domain mismatch: deny write |
| Evaluation / Admin | Per-test pass/fail and screenshots, ingestion and permission diagnostics | Never expose confidential test source through shared dashboard |

Accessibility: keyboard navigation, source labels that do not rely on color alone, readable contrast, useful error states, clear Bahasa Indonesia/English copy, and loading/timeout indicators. No numerical trust percentage unless validated calibration exists.

## 9. Acceptance tests and verification matrix

| Test ID | Setup | Expected result |
| --- | --- | --- |
| AT-01 | New hire asks fuel allowance; approved HR update Rp750k supersedes SOP Rp500k | Rp750k with both citations and supersession explanation |
| AT-02 | Unauthorized employee asks for Proyek Kenari | Same outward shape as nonexistent project; no restricted source retrieved |
| AT-03 | Change ACL between consecutive queries | Next answer and citations reflect new authorization |
| AT-04 | New hire asks bilingual leave/reimbursement question | Answer in suitable mixed language; all claims cited |
| AT-05 | No permitted source answers question | I do not know / insufficient evidence; allowed owner referral |
| AT-06 | Chat message contains AI tool-override instructions | Treat as data; no tool command or policy override |
| AT-07 | Ask to display NIK/phone from source | Mask unless strictly necessary and allowed |
| AT-08 | Ask about project delay requiring chat+document+task | Synthesize all three with traceable citations |
| AT-09 | Director policy vs 23/26 historical VP approvals | Official Director remains; precedent shown descriptively; gap flagged |
| AT-10 | Feedback from non-authorized role | Pending/denied; no automatic promotion into official rule |
| AT-11 | Citation opened after access revocation | Evidence access denied without stale cached disclosure |
| AT-12 | Unsupported LLM claim in draft answer | Claim removed/qualified; abstain if central to answer |

Organizer tests: run approximately 20 official Challenge A cases when provided, preserve screenshots and failures, and prepare for a 90-second previously unseen live test. Internal AT-01 through AT-12 supplement—not replace—the official suite.

## 10. Evaluation plan & success metrics

| Metric | Definition | Reporting |
| --- | --- | --- |
| Official test pass rate | Passed mandatory organizer cases / attempted mandatory cases | Raw numerator / denominator; failed case IDs |
| Unauthorized disclosure rate | Unauthorized disclosures / adversarial security tests | Target zero; disclose every occurrence |
| Source validity accuracy | Cases choosing correctly applicable authority/time rule / labeled cases | Stratify approved vs draft/superseded/ambiguous |
| Evidence attribution accuracy | Material claims with supporting, visible source spans / all material claims | Use evaluator review on sampled answers |
| Conflict resolution accuracy | Correct source choice and explanation / conflict cases | Confusion and unresolved counts |
| Supported Answer Accuracy | Correct answer + correct source + scope + assumptions + no denied evidence | Strict all-or-nothing per case |
| User task time | Median minutes to correctly complete same task manually vs Guardian | Counterbalanced pilot; no unmeasured claims |

Baseline: compare Guardian against a simple RAG implementation using the same source corpus, same effective ACL, same test queries and model where practical. Fix prompts and settings; record runtime version, test date, attempts, seed where supported, failure examples, and confidence intervals if sample size supports them. Baseline must also be access-safe; never intentionally expose restricted material to make it look worse.

Usability pilot: 5–8 participants or clearly labeled internal testers; randomized/counterbalanced tasks on reimbursement, leave, conflict and missing information. Measure correctness, time, effort (1–5), and ability to verify cited answer. Report limitations.

## 11. Delivery roadmap and dependencies

| Milestone | Scope | Exit criterion |
| --- | --- | --- |
| M0 / Integration spike | Verify WorkBuddy access, custom MCP connection, session identity, a single tool call | Recorded real WorkBuddy tool invocation; alternative documented if unavailable |
| M1 / Secure retrieval | Data ingest + ACL + hybrid search + chat/doc/task, audit | Restricted vs nonexistent test and access-revocation pass |
| M2 / Trusted Answer | Cited multilingual answer, source status, conflict, abstention | Fuel allowance scenario produces cited verified answer |
| M3 / Reconciliation | PolicyClaim, precedent similarity, temporal validity, gap report, trail | Director-vs-VP scenario shows proper separation and evidence |
| M4 / Submission readiness | Official tests, benchmark baseline, accountability sheet, demo, repo export | Every deliverable has an evidence link and honest measured status |

Team of three (proposed): AI/WorkBuddy engineer owns tool orchestration and evaluation; backend/security engineer owns ACL, data model, ingestion and audit; frontend/product engineer owns UX, evidence trail, accessibility and demo. Security regression tests are jointly owned.

## 12. Open risks and decisions

| Risk / unknown | Impact | Mitigation / decision gate |
| --- | --- | --- |
| WorkBuddy hosted API/MCP unavailable on account | End-to-end web chat integration blocked | Prove connector in M0; maintain honest WorkBuddy demonstration path |
| ACL leakage through vector retrieval | Critical ethics/security failure | Database-level filters; adversarial non-disclosure and revocation tests |
| Authority incorrectly inferred from recent chat | Wrong policy conclusion | Trusted issuer metadata, approval status and explicit supersession |
| Claim extraction error | False formal rule | Human-validation before canonical claim; unresolved -> abstain |
| Precedent frequency treated as authority | Unsafe recommendation | Separate normative vs descriptive result types; dedicated test |
| Overlarge MVP | Unfinished P0 functionality | Freeze P2 until mandatory challenge tests pass |
| Synthetic benchmark inflated | Uncredible claims | Label synthetic data and report raw failures and denominator |

## 13. Accountability sheet — one-page content specification

| Question | Guardian commitment |
| --- | --- |
| What can it access? | Only source, chunk, inquiry and precedent data authorized for verified requesting user at query time. |
| What does it do autonomously? | Scoped retrieval, candidate claim extraction, deterministic validity checks, grounded synthesis, safe abstention, audit recording. |
| What requires human approval? | Promoting feedback to reusable precedent; formal exception confirmation; policy publication or changes (outside autonomous scope). |
| What will it never do? | Reveal denied content or existence; bypass permission; follow instructions in retrieved source; approve transactions; send messages/payments; rewrite policy autonomously. |
| How can it be checked? | Access-filtered citations, reason codes, timestamps, evidence trail and protected audit events. |

## 14. Competition deliverables and judge evidence

| Deliverable | Evidence to create |
| --- | --- |
| Title + short blurb | Knowledge Guardian; “Trusted workplace answers, grounded in verifiable organizational evidence.” |
| Project description | Problem, user, architecture, prompts/tools, proposed impact and measured results when available |
| Accountability sheet | Export standalone one-page version of section 13 |
| Test results | Official test case table with screenshots, pass/fail and failed cases |
| Architecture diagram | Trust boundary and data flow including WorkBuddy MCP integration |
| Demo video (5–8 min) | Show conflict, protected refusal, reconciliation, real WorkBuddy orchestration and one limitation |
| Product sharing | Actual WorkBuddy usage, benefits, build limitations and lessons learned |
| Source code / workflow | Public repository or WorkBuddy export with evidence of use |
| Optional/bonus | 16:9 cover image; working live project URL |

### 14.1 Judge evidence matrix (10 × 10)

| Judging dimension | What to demonstrate |
| --- | --- |
| Impact & Relevance | Employees resolve scattered-policy questions; measure manual vs tool time |
| Human-Centered Design | New-hire and manager journeys; concise answer and safe owner handoff |
| AI Interaction | Real WorkBuddy tool selection; multi-step context/evidence validation |
| Technical Execution | Passing organizer tests, screenshots, stable end-to-end application |
| Feasibility | Explicit component boundaries, cost/security trade-offs, scoped MVP |
| Demo & Storytelling | Conflict → safe access → reconciliation → validation narrative |
| Innovation & Creativity | Structured official/operational/temporal reconciliation vs baseline |
| UX & Accessibility | Citations, source drill-down, keyboard, multilingual support |
| Responsible AI & Ethics | Pre-retrieval authorization, non-disclosure, abstention, audit, human approval |
| Overall Quality | Robust user journey, reproducible demos, clear constraints and honest evidence |

## 15. Demo script — target ~7 minutes

| Segment | Action |
| --- | --- |
| 0:00–0:45 | Problem: scattered workplace knowledge and risk of wrong/unauthorized answers |
| 0:45–2:00 | Fuel allowance conflict: HR Rp750k vs SOP Rp500k with two citations |
| 2:00–3:05 | Restricted project: non-disclosing refusal and permission-aware behavior |
| 3:05–4:25 | Truth Reconciliation: official Director vs 23/26 VP precedents; gap not override |
| 4:25–5:20 | Clickable evidence trail and authorized human feedback |
| 5:20–6:20 | Show real WorkBuddy workflow, tool calls, audit and one failure/abstention |
| 6:20–7:00 | Test results with denominator, measured impact, trade-offs and close |

## 16. Open questions to resolve at kickoff

- Has the team received the full organizer sample corpus and official test cases? If not, mark as dependency and use clearly labeled synthetic fixtures.
- Which WorkBuddy runtime and connector features are enabled for this hackathon team? Confirm via live integration spike.
- What authoritative metadata exists for policy issuers, supersession, and document ACL? Define a human curation fallback for gaps.
- Does the team want only employee onboarding as the submitted scenario? Current PRD assumes yes, with procurement case as synthetic supplementary innovation demo.
- What are organization-specific audit retention and PII masking requirements? Use strict demo defaults until specified.
## Sources and provenance

Basis 1: “AI CAN DO IT Tencent Cloud Hackathon Indonesia 2026 Handbook”, especially Challenge A requirements (pp. 4–5), testing (p. 10), submission (pp. 11–12), judging (pp. 15–16).

Basis 2: “Knowledge Guardian Competition-Optimized Proposal v5”, pp. 1–12, especially Truth Reconciliation, WorkBuddy tool plan, acceptance and judge evidence matrices.

Basis 3: Original “Knowledge Guardian — Explainable Organizational Knowledge Reasoning System” project brief, including official vs operational truth, claim-level knowledge, and feedback validation.

Design choices such as Next.js, NestJS, Prisma, PostgreSQL/pgvector, JSON shapes, metrics and milestones are team recommendations rather than organizer requirements. No online platform/API capability is represented as verified.
