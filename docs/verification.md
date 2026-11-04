# Backend verification

Final verification on 4 November 2026 used Node.js 22.22.0, npm 10.2.3, PostgreSQL from `pgvector/pgvector:pg17`, and real HTTP/MCP clients against an isolated temporary database.

| Check                         | Result                                  |
| ----------------------------- | --------------------------------------- |
| `npm run build`               | Passed for contracts, API, and frontend |
| `npm run lint`                | Passed across all workspaces            |
| `npm run typecheck`           | Passed across all workspaces            |
| `npm run test:api`            | 42 passed, 0 failed, 0 skipped          |
| `npm audit --omit=dev --json` | 0 reported runtime vulnerabilities      |

Tests cover user/agent authentication, CLI bootstrap, strict input validation, organization and department ACLs, lexical/vector retrieval, citation identity, PII patterns, parameterized queries, historical/current policy selection, unresolved conflicts, the synthetic 23/26 VP precedent scenario, independent human feedback review, stored answer/trail revocation, MCP origin and actor isolation, and future-effective source changes.

Additional regression coverage includes ACL-aware domain-owner handoff, inquiry-bound MCP audit correlation, 11 personal-data categories with purpose-specific grants and revocation, redaction across metadata and chunk boundaries, capitalization changes, shared demo seeding, and contract-valid UI mocks.

Every integration run applies the committed migrations to a newly created database. Its container is removed afterward. Application ports and the development database are not used by these tests.

These results are backend regression evidence, not organizer scores. The synthetic cases do not measure enterprise accuracy or productivity. Actual WorkBuddy connectivity, final-agent answer entailment and prompt-injection resistance, frontend journeys, official fixtures, timing-side-channel behavior, and production load remain to be evaluated by the team.
