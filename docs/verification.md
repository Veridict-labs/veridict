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
