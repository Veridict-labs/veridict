# Backend verification

Final verification on 4 November 2026 used Node.js 22.22.0, npm 10.2.3, PostgreSQL from `pgvector/pgvector:pg17`, and real HTTP/MCP clients against an isolated temporary database.

| Check                         | Result                                                       |
| ----------------------------- | ------------------------------------------------------------ |
| `npm run build`               | Passed for contracts, API, and frontend                      |
| `npm run lint`                | Passed across all workspaces                                 |
| `npm run typecheck`           | Passed across all workspaces                                 |
| `npm run test:api`            | 42 passed, 0 failed, 0 skipped                               |
| `npm run test:agent`          | 10 passed, 0 failed (client smoke tests; not live WorkBuddy) |
| `npm audit --omit=dev --json` | 0 reported runtime vulnerabilities                           |

Tests cover user/agent authentication, CLI bootstrap, strict input validation, organization and department ACLs, lexical/vector retrieval, citation identity, PII patterns, parameterized queries, historical/current policy selection, unresolved conflicts, the synthetic 23/26 VP precedent scenario, independent human feedback review, stored answer/trail revocation, MCP origin and actor isolation, and future-effective source changes.

Additional regression coverage includes ACL-aware domain-owner handoff, inquiry-bound MCP audit correlation, 11 personal-data categories with purpose-specific grants and revocation, redaction across metadata and chunk boundaries, capitalization changes, shared demo seeding, and contract-valid UI mocks.

Every integration run applies the committed migrations to a newly created database. Its container is removed afterward. Application ports and the development database are not used by these tests.

These results are backend regression evidence, not organizer scores. The synthetic cases do not measure enterprise accuracy or productivity. Actual WorkBuddy connectivity, final-agent answer entailment and prompt-injection resistance, frontend journeys, official fixtures, timing-side-channel behavior, and production load remain to be evaluated by the team.

## HF runtime checkpoint — 6 November 2026

After synchronizing backend `a043785`, Person 1 implemented the NestJS-hosted HF agent. Verification used Windows, Node.js 24.19.0, npm 11.12.1, Docker 29.5.3, and a temporary pgvector PostgreSQL container.

| Check                                         | Actual result                                                                                 |
| --------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `npm run test:agent`                          | 30 passed, 0 failed, 0 skipped; local provider/model and HTTP/MCP fixtures                    |
| `npm run test:api`                            | 45 passed, 0 failed, 0 skipped; includes scripted HF orchestration with real PostgreSQL       |
| `npm run lint`                                | Passed across workspaces                                                                      |
| `npm run typecheck`                           | Passed across workspaces                                                                      |
| API/contracts/agent build                     | Passed as part of test commands                                                               |
| `npm run build -w @veridict/web -- --webpack` | Passed; default bundler configuration unchanged                                               |
| Live HF synthetic fuel scenario               | Failed before an answer: HF HTTP 402 mapped to `AI_QUOTA_EXHAUSTED`; inquiry stayed `PENDING` |

The live failure is preserved in [the actual report](evaluation/hf-live-2026-11-06T11-30-48-588Z.json). No further live scenarios were attempted after that provider error. This establishes error handling and connectivity to the HF route, not valid model-generated answers or account credit availability. The full live suite remains pending until the operator resolves billing.

New tests exercise owner-only processing, inquiry-bound session cleanup, strict tool dispatch, fabricated/nested citation rejection, support-check abstention, no-evidence clarification, optional organization billing, bounded calls, revocation before the next model request and before persistence, changed masking within a tool batch, and history dependencies for all model-exposed chunks. Scripted tests do not measure the real model's entailment accuracy or prompt-injection robustness. The new runtime remains lexical unless real matched embeddings are supplied.

## Gemini checkpoint — 6 November 2026

The primary provider is now Gemini with gemini-3.5-flash; HF is an explicit optional provider. Provider errors never trigger fallback. Google tool-call signatures are preserved only in transient model history. Tool-only responses without content are normalized. Credentials stay in ignored apps/api/.env.

- npm run test:agent: **36 passed**, 0 failed; includes Gemini transport, signature round trip, safe errors, no fallback and bounded verification context.
- npm run test:api: **46 passed**, 0 failed; PostgreSQL/HTTP/MCP regression and explicit provider factory selection.
- npm run lint and npm run typecheck: passed across workspaces. API/contracts/agent build passed through tests; no frontend code changes in this checkpoint.

A small Gemini Lite preflight returned HTTP 200. The older 2.5 Lite returned 404 with a model replacement recommendation. Real Lite application attempts exposed missing-content parsing and strict-tool validation failures, budget exhaustion and provider 503 errors; these are preserved in the evaluation reports.

[Gemini Flash application run](evaluation/gemini-live-2026-11-06T12-13-03-584Z.json) returned HTTP 201 and persisted a safe INSUFFICIENT_EVIDENCE answer after support rejection. It did **not** pass the fuel amount acceptance check. Support checking was then corrected to include the same authorized tool observations/metadata available during drafting, with a separate 180000-character bound. Local regression passed. [The subsequent five-scenario attempt](evaluation/gemini-live-2026-11-06T12-15-03-878Z.json) stopped on the first case with AI_RATE_LIMITED (provider 429); the other four scenarios were not attempted. Cloud requests stopped at that point.

The latest support-check change and full live suite remain unvalidated against the provider. Do not label Person 1 fully accepted. Check the project's actual rate/quota limits before a deliberate future live run. No billing upgrade or top-up was performed. See [current checkpoints](person-1-checkpoints.md).

## Privacy-flow integration — 7 November 2026

Validation used Node.js 24.21.0 and PostgreSQL 17/pgvector in an offline Linux container, using locally cached toolchains and dependencies. The container had no external network or credentials, a clean allowlisted environment, read-only source/toolchain mounts, and scratch-only writes. Limits were two CPUs, 1.5 GiB memory, 160 processes, a 1 GiB scratch filesystem, 64 MiB per file, 512 open files, and an eight-minute wall timeout. PostgreSQL and HTTP/MCP fixtures used only the container's isolated loopback namespace. Development services and their ports were not used.

| Check | Result |
| --- | --- |
| Contracts, agent, API TypeScript compilation | Passed |
| Frontend TypeScript check | Passed |
| Backend ESLint | Passed |
| Frontend Next/React/TypeScript lint rules with a portable Node resolver | Passed |
| Agent tests | 36 passed, 0 failed, 0 skipped |
| API tests | 52 passed, 0 failed, 0 skipped |
| Git whitespace checks | Passed |

The new regressions cover server-redacted history titles, READ revocation, bilingual personal-value intent and policy/definition/negation exclusions, explicit mobile/cell-number wording, email-versus-physical-address intent, backend-only personal-request completion, denied and ambiguous values, zero provider calls, audit correlation, grant revocation, owner/delegated identity isolation, and the production request limit. Each independent HTTP test resets throttler storage; the guard remains enabled and its limit has a separate assertion. Personal-data scenarios run before the existing fixture deliberately deactivates the employee.

The existing test database lifecycle was adapted for the sandbox: committed migration SQL was applied with `psql` to a new temporary cluster, while the test harness's Docker lifecycle and Prisma migration invocation were mapped to that already prepared cluster. This validates the schema and application behavior, not Prisma's migration CLI or regeneration. The generated Prisma client was already available locally. Compilation preserved workspace symlinks to use the read-only vendor layout.

The local install contains Windows native bindings. In the disposable frontend copy, lint kept the configured rules and used the JavaScript Node import resolver instead of the native TypeScript resolver; TypeScript separately checked module types. The original frontend lint configuration was not changed. A production Next.js bundle, browser interaction journeys, and the unmodified native resolver on Windows were not rerun in this sandbox. No dependency installation or cloud inference was performed. Real-model fuel acceptance, multilingual/injection evaluation, and the organizer suite remain pending as described above. See [the implemented privacy flow](privacy-flow.md).

## Policy orchestration — 7 November 2026

The same offline sandbox passed **57 agent tests** and **78 API/contract/frontend transport tests**, with zero failures or skips. Contracts, agent and API compilation, frontend typecheck, backend ESLint, and frontend lint with the portable resolver passed. Database lifecycle and migration CLI limitations are unchanged from the privacy-flow checkpoint.

New coverage verifies backend policy-domain hints, canonical official answers, sourced unresolved conflicts, partial/wrongly typed context, numeric boundary conditions, fresh policy snapshots at persistence and history read, historical pinning, owner selection, immutable observations, bounded automatic tools, finite verifier diagnostics and client error classification. The previous timing-sensitive source-activation smoke test now checks one millisecond before, exactly at, and one millisecond after activation through a server-only fixture clock, without sleeping. A conditional future policy is also tested at activation while an explicitly historical inquiry remains valid.

Determinism applies to policy decisions given authorized records, structured scope and time. Retrieval/intent and general semantic support remain model-dependent; manual external agent completions are not the hosted canonical pipeline. No live model evaluation, billing change, official organizer testing, production frontend build or interactive browser journey is claimed. See [the policy flow and complete scope](policy-orchestration.md).
