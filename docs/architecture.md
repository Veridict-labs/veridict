# Backend architecture and trust boundaries

The backend owns identity, current authorization, persisted evidence, deterministic policy checks, and audit. Person 1 owns the Gemini-backed runtime and answer support checks; Person 3 owns employee/reviewer interfaces. WorkBuddy is an optional external MCP client; see the [runtime decision and limits](gemini.md).

```mermaid
flowchart TD
  Web[Next.js frontend] -->|User bearer token| API[NestJS REST]
  Agent[WorkBuddy connector] -->|Per-user delegated token| MCP[Streamable HTTP MCP]
  API --> Guard[Database-verified identity and role]
  API -->|Owner explicitly runs inquiry| Runtime[Grounded agent runtime]
  Runtime -->|Authorized masked context| LLM[Gemini API / explicitly selected HF]
  Runtime --> Guard
  MCP --> Guard
  Guard --> Scope[Organization lock and fresh session check]
  Scope --> ACL[Current READ and REVIEW grants]
  ACL --> Search[Authorized lexical and vector retrieval]
  ACL --> History[Inquiry and precedent reauthorization]
  Search --> Policy[Authority, context, time, supersession]
  Policy --> Evidence[Structured evidence or unresolved result]
  History --> Evidence
  Evidence --> Audit[Organization-scoped audit]
  Scope --> DB[(PostgreSQL and pgvector)]
  Search --> DB
  History --> DB
  Audit --> DB
```

Retrieved documents, chats, and tasks are untrusted data. They cannot change the actor, ACL, tool schema, or policy publication authority. The final agent must not treat embedded source instructions as tool commands.

Access is denied without an explicit matching grant. Administrators manage ACLs but need grants for retrieval. REVIEW is separate and requires human domain authority. A case remains visible only while all evidence is readable. A stored inquiry is hidden when any cited source loses access, including evidence in structured statements and trail nodes.

Prisma manages relational models/migrations; parameterized SQL handles full-text and pgvector retrieval. Exact filtered scans prioritize correctness for the hackathon corpus. Scaling and approximate indexes need separate measurement.

The owner-only `/v1/inquiries/:id/run` endpoint calls the explicitly configured model provider with a temporary inquiry-bound AGENT session. Only masked evidence from authorized read services is passed to the model. All model-exposed chunks become history dependencies, with reauthorization between turns and at persistence. A separate model-based support check can reject drafts; it is not proof of semantic entailment or complete injection resistance. Calls are bounded with no inference retry or credit top-up. External MCP completion remains supported. New inquiries are not automatically queued.
Domain-owner handoff is backed by readable directory evidence. Personal-data disclosure additionally requires a category/purpose grant and an immutable user-created inquiry request. Known sensitive values stay redacted on ordinary evidence, policy, precedent, review, and answer views. Contextual fields require curator annotations; the system is not a general PII discovery model.

Inquiry-bound agent sessions propagate server-generated tool-call IDs into audit. Owner-visible traces reauthorize their resource references; administrator audit remains organization-scoped. Shared synthetic fixtures are described in [the demo guide](demo-fixtures.md).
