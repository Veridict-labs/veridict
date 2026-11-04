# Backend integration guide

This guide describes the Person 2 backend. Request schemas and TypeScript types are exported from `@veridict/contracts`. Enums are uppercase. Input objects reject unknown fields, including model-supplied actor identities. Business endpoints require `Authorization: Bearer <access_token>` unless marked public.

## Authentication

`POST /v1/auth/login` accepts `{ "org_slug": "veridict", "email": "admin@example.com", "password": "your chosen password" }` and returns `access_token`, `token_type`, and `expires_at`. User sessions last eight hours; agent sessions last fifteen minutes. Tokens are random 256-bit secrets; only their SHA-256 hashes are stored. Passwords use salted scrypt. Login is limited to ten attempts per minute per IP; other routes have an in-memory limit of 1,000 requests per minute per IP.

`GET /v1/auth/me` returns the current actor ID, organization, role, department, review domains, session kind, and permission version. Identity and active status are verified against the database on every request. `POST /v1/auth/logout` revokes the supplied session. `POST /v1/auth/tool-token` issues a short-lived AGENT token bound to the current user. Agent tokens cannot create more delegated tokens or perform administrative/human-review operations. Delegated tokens expire independently of the parent user session. Deactivating a user revokes all their sessions immediately.

PowerShell login example after creating the administrator described in the README:

```powershell
$api = 'http://localhost:3001'
$loginBody = @{
  org_slug = $env:BOOTSTRAP_ORG_SLUG
  email = $env:BOOTSTRAP_EMAIL
  password = Read-Host 'Password' -MaskInput
} | ConvertTo-Json
$session = Invoke-RestMethod -Method Post -Uri "$api/v1/auth/login" -ContentType 'application/json' -Body $loginBody
$headers = @{ Authorization = "Bearer $($session.access_token)" }
$me = Invoke-RestMethod -Uri "$api/v1/auth/me" -Headers $headers
```

## REST endpoints

| Method     | Path                                    | Access and purpose                                                |
| ---------- | --------------------------------------- | ----------------------------------------------------------------- |
| GET        | `/health`                               | Public liveness; returns `ok`                                     |
| POST       | `/v1/auth/login`                        | Public, rate-limited login                                        |
| GET        | `/v1/auth/me`                           | Current verified actor                                            |
| POST       | `/v1/auth/logout`                       | Revoke the supplied session                                       |
| POST       | `/v1/auth/tool-token`                   | User session; issue an agent token                                |
| GET / POST | `/v1/users`                             | Admin user listing / creation                                     |
| PATCH      | `/v1/users/:id`                         | Admin changes role, department, active flag, review domains       |
| POST       | `/v1/knowledge/preview`                 | Admin; preview masked chunks without persistence                  |
| POST       | `/v1/knowledge/ingest`                  | Admin; ingest a document, chat, or task export                    |
| POST       | `/v1/knowledge/search`                  | Authorized lexical or hybrid retrieval                            |
| PUT        | `/v1/sources/:id/permissions`           | Admin; replace the entire source ACL                              |
| GET        | `/v1/sources/:id/evidence?chunk_id=...` | Reauthorize and open one chunk                                    |
| POST       | `/v1/policies`                          | Human domain reviewer with source READ + REVIEW; validate a claim |
| POST       | `/v1/policies/resolve`                  | Resolve visible claims by context and effective time              |
| POST       | `/v1/cases`                             | Human reviewer; record a validated historical case                |
| POST       | `/v1/cases/search`                      | Search visible validated cases                                    |
| POST       | `/v1/truth/reconcile`                   | Retrieve and compare official rules and observed practice         |
| POST / GET | `/v1/inquiries`                         | Create a pending inquiry / list own accessible inquiries          |
| GET        | `/v1/inquiries/:id`                     | Own inquiry with current evidence access checked                  |
| POST       | `/v1/inquiries/:id/answer`              | Delegated agent for the inquiry owner; persist an answer          |
| POST       | `/v1/feedback`                          | Inquiry owner or their agent; submit pending feedback             |
| GET        | `/v1/feedback?domain=...`               | Domain reviewer; list reviewable pending feedback                 |
| GET        | `/v1/feedback/:id`                      | Domain reviewer; inspect proposal and evidence                    |
| POST       | `/v1/feedback/:id/validate`             | Independent human reviewer; validate or reject                    |
| GET        | `/v1/audit`                             | Admin; organization-scoped audit records                          |
| POST       | `/v1/audit/prune`                       | Admin; remove logs older than `retention_days` (default 30)       |
| POST       | `/mcp`                                  | Authenticated Streamable HTTP MCP                                 |

User, inquiry, and audit lists accept `limit` (1–100, default 30) and an optional UUID `cursor`. Inquiry/audit responses expose `next_cursor`; user listing returns an array. Resource denial and absence share HTTP 404 with `{ "error": "UNAVAILABLE", "message": "Resource unavailable" }`. Invalid input is HTTP 400, role violations 403, and conflicts 409. REST POST operations return 201; MCP uses its transport-specific statuses.

## Ingestion and permissions

Documents accept `content`; chat/task exports accept `records` with `text` and optional `author`, `timestamp`, and `reference`. These are normalized text/JSON inputs, not binary DOCX/PDF parsers or live SaaS connectors. The organizer corpus has not been supplied; tests use synthetic data.

```powershell
$sourceBody = @{
  type = 'DOCUMENT'
  title = 'Fuel reimbursement policy'
  content = 'The monthly fuel allowance is Rp500000.'
  state = 'APPROVED'
  issuer_id = $me.id
  valid_from = '2026-01-01T00:00:00Z'
  permissions = @(@{ subject_type = 'ORGANIZATION'; subject_id = $me.org_id; action = 'READ' })
} | ConvertTo-Json -Depth 10
$source = Invoke-RestMethod -Method Post -Uri "$api/v1/knowledge/ingest" -Headers $headers -ContentType 'application/json' -Body $sourceBody
```

Sources default to private READ + REVIEW grants for the ingesting administrator. Sharing requires USER, DEPARTMENT, or ORGANIZATION grants. READ does not imply REVIEW. Administrators still need source grants for retrieval. Replacing an ACL does not preserve owner grants; include every grant that should remain. Foreign user/organization grants are rejected.

Human reviewers require matching `review_domains` plus source READ and REVIEW. ADMIN has domain authority but still needs source grants. Approved sources require an active administrator/reviewer issuer. Canonical policy claims require a domain-authorized issuer, a human validator, and a `result` quoted from the source chunk. Approval metadata represents human curation, not LLM inference. Replacement sources require sequential `version`, `supersedes_id`, and an effective start; cross-source claim supersession must follow that version chain.

Chunks contain at most 1,600 UTF-16 code units with 200 overlap, original normalized-text offsets, and a SHA-256 hash. Returned excerpts mask NIK and Indonesian phone patterns. `redacted` indicates masking; displayed length can differ from the original span. This is a targeted pattern masker, not a general PII classifier.

For real embeddings, call `/v1/knowledge/preview` with the ingestion body, embed the returned masked chunks, then submit one nonzero numeric vector per chunk together with `embedding_model`. Vectors for a source must have equal dimensions (at most 4,096). The backend does not fabricate embeddings or select an external provider.

## Retrieval and policy resolution

Search accepts `{ "query": "fuel allowance", "source_types": ["DOCUMENT", "CHAT"], "limit": 10 }`. Optional `embedding` and `embedding_model` enable vector candidates. The backend checks model/dimensions, applies cosine distance at most 0.8, and fuses lexical/vector rankings using reciprocal rank fusion (constant 60). `retrieval_score` is a ranking score, not calibrated confidence. Queries are parameterized and operate on a materialized ACL-filtered candidate set. The MVP uses exact vector scans for access correctness on a small corpus.

Policy resolution accepts `domain`, flat scalar `context`, and optional ISO `as_of`. Predicates use exact equality and inclusive numeric bounds such as `amount_min` / `amount_max` against `context.amount`. Validity starts are inclusive and ends exclusive. Differing applicable approved rules produce `NEEDS_REVIEW`. Recency alone does not establish authority. An inaccessible approved replacement does not cause fallback to an obsolete rule. `as_of` evaluates effective validity using currently available records; it does not reconstruct everything known at a historical date.

Cases must be VALIDATED, and every evidence source must remain readable. Comparisons expose matching factors and disqualifying differences. At least one matched context factor is needed for comparability; an empty context only lists cases. Reconciliation counts describe the returned sample, with `truncated` marking incomplete results. Domains with more than 500 policy candidates or 200 case candidates require narrower partitioning or later retrieval improvements.

Example reconciliation: `{ "domain": "procurement", "context": { "type": "saas", "amount": 180000000 }, "max_results": 30 }`. A historical approver mismatch can set `gap_flag`; it never overrides formal authority or executes approval.

## Agent and frontend handoff

1. The frontend logs in and posts `{ "question": "..." }` to `/v1/inquiries`.
2. The backend returns `inquiry_id`, PENDING, and `orchestration: AWAITING_AGENT`.
3. The user issues a delegated token via `/v1/auth/tool-token`. Person 1's connector binds it to the requesting user, without a shared administrator token.
4. Person 1 calls authorized tools, checks semantic support for every material claim, and submits through `complete_inquiry` or the agent-only answer endpoint.
5. The frontend polls the owner's inquiry while PENDING. No background WorkBuddy queue or answer streaming is implemented.

Answer fields are `status`, `answer`, `citations`, `assumptions`, `limitations`, nullable `official_truth` / `operational_truth`, `conflicts`, and `decision_trail`. A supported statement is `{ statement, evidence: [{ source_id, chunk_id }] }`; a trail node is `{ label, evidence: [...] }`. Nested evidence is mandatory and participates in revocation checks. ANSWERED requires a top-level citation. The backend verifies reference identity and access; semantic entailment and final-agent injection resistance remain Person 1's responsibility.

Feedback contains `inquiry_id`, `domain`, `action`, `reason`, and optional `proposed_case` (context, outcome, authority, evidence IDs). Proposed evidence must be a subset of inquiry evidence. An independent human with matching domain and current READ + REVIEW validates it before precedent creation. Feedback never rewrites policy.

## MCP

Connect Streamable HTTP to `http://localhost:3001/mcp` using a per-user bearer token. `MCP_PUBLIC_URL` configures the expected public host/origin; `WEB_ORIGIN` allows the frontend origin. Set both for the actual deployment behind a reverse proxy. The maintained MCP SDK v1 negotiates its supported protocol; actual WorkBuddy compatibility still requires a live spike.

Tools: `search_authorized_knowledge`, `resolve_policy_claims`, `find_validated_precedents`, `reconcile_truth`, `get_evidence`, `submit_feedback`, and `complete_inquiry`.

The server is stateless between HTTP requests and verifies identity per invocation. Arguments cannot select a different actor. Missing and denied evidence share a generic tool error. Legacy SSE and GET/DELETE session transports are not implemented.

## Domain-owner routing

`POST /v1/escalations/resolve` and MCP `resolve_domain_owner` accept `{ "domain": "fuel" }`. Admins curate mappings using `PUT /v1/domains/:domain/owner` with `owner_id`, `evidence_chunk_id`, and `contact_email`, or DELETE the same path. Curating a mapping requires source READ and REVIEW. The owner must be active in the same organization.

Contacts are visible only while their directory evidence is readable. Restricted and missing entries return the same `{ status: "UNAVAILABLE", owner: null, evidence: null }`. Setting `escalation_domain` on an INSUFFICIENT_EVIDENCE answer adds a freshly authorized `escalation` to the inquiry response and includes its directory evidence in stored-answer revocation. Mapping updates/removal mark affected answers for revalidation. A business-email directory entry does not grant policy authority or permission to reveal personal phone numbers.

## Inquiry audit correlation

Issue an agent token with `POST /v1/auth/tool-token` and `{ "inquiry_id": "..." }` to bind it to one currently accessible inquiry owned by the user. The token cannot switch inquiries. Existing unbound tokens remain supported for standalone searches. REST callers can attach `X-Inquiry-ID`; MCP tools accept an optional `inquiry_id` when the token is unbound. Both paths verify ownership and current evidence access before performing the operation.

MCP invocations receive server-generated `tool_call_id` values. Accepted invocations log STARTED and COMPLETED/DENIED events; service events share their inquiry/tool-call context. Result text is hashed in audit rather than copied. `GET /v1/inquiries/:id/trace` exposes the owner's paginated trace with source/chunk references filtered by current READ access. Administrators can filter their organization audit using `/v1/audit?inquiry_id=...`. Requests with invalid context are rejected before business operations. A complete agent trace requires a bound token or an explicit inquiry context; the server never guesses from a user's most recent question.

## Operations and verification

Business responses use `Cache-Control: no-store`. ACL writes take an exclusive organization lock; protected operations take a shared lock and revalidate identity. Completed revocations affect subsequent operations. Source replacements invalidate dependent answers; time-based changes are checked when opening an inquiry. A new answer can still cite old and new sources to explain their conflict.

Audit stores actor/resource IDs, decisions, counts, and hashes of query/answer text. Plaintext passwords, tokens, search text, and source excerpts are excluded from audit metadata. Inquiry content remains in protected inquiry records. Handler denials and MCP denials are logged; requests rejected before identity verification do not create actor-linked audit events. Schedule the admin prune endpoint under operator control to enforce retention. Expired sessions and source/inquiry retention still need an operational cleanup policy.

`npm run test:api` uses temporary PostgreSQL and real HTTP/MCP clients. It tests ACL/history revocation, nested evidence, tenant isolation, non-disclosing response shapes, authority/time, human feedback, PII patterns, parameterized SQL, and MCP identity. These tests do not establish timing indistinguishability, official test scores, final-agent correctness, or WorkBuddy connectivity.

Deployment requires TLS, production identity/session delivery, least-privilege database credentials, distributed throttling for multiple instances, an embedding provider, and the organizer corpus. This is a tested backend foundation, not a claim of production readiness.
