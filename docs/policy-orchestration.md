# Deterministic policy decisions

The NestJS-hosted runtime receives `policy_domains` from claims attached to currently readable evidence. This metadata comes from the backend, never from instructions embedded in source text. Before an `ANSWERED` completion, the runtime resolves every observed policy domain, including domains omitted from the model's final citations. Context from a scoped precedent lookup can be reused; missing or wrongly typed required context requests clarification. A known mismatch excludes the conditional claim. Zero and false remain supplied values. Invalid range operators and contradictory numeric bounds are rejected when a claim is created.

For supported policies, the runtime builds the official answer, formal statement and citations directly from backend results. The model cannot replace the formal amount or authority. Explicitly superseded and out-of-window claims are quoted as exclusions. Conflicting applicable approved claims produce an insufficient-evidence response with sourced alternatives and no formal winner. Inconsistent scopes for the same domain require clarification. For reconciliation, comparable case records determine nonbinding sample counts; model-written counts and summaries do not determine them. Separate precedent and policy tool calls are supported when their scopes match. A historical sample never authorizes an exception.

Policy snapshots are detached from mutable tool objects and stored in protected answer metadata. They are checked again under the organization write lock before persistence, and under current authorization on subsequent inquiry reads. A changed policy blocks persistence or marks the stored answer `NEEDS_REVALIDATION`. Current-time snapshots advance with the business clock; an explicit historical `as_of` stays pinned. A server-only injectable clock permits exact boundary tests. Requests and environment variables cannot override this clock; authentication expiration continues to use actual time.

An insufficient answer preserves a unique verified owner even when the draft omits its escalation field. Availability must include observed directory evidence; a subsequent unavailable result removes the earlier candidate. Multiple owners or subject domains are not selected automatically. A new owner lookup requires one observed backend policy domain; an empty search never invents a domain. Owner contacts are resolved again by the backend on read with their current ACL.

The verifier receives the original question, reference UTC time, canonical draft, cited excerpts and tool observations. Its bounded reason codes are recorded in the inquiry audit summary. The client distinguishes application request limits, model request/quota limits, service capacity, expired sessions, configuration failures and changed evidence, without displaying raw upstream details. Numeric `Retry-After` values are bounded. There is no automatic inference retry or provider fallback.

Automatic policy and owner calls share the existing twelve-tool budget. The run still has at most six drafting calls plus one verifier call. The evidence ledger is bounded to 100 chunks, individual results to 64000 characters, and verification context to 180000 characters. At most eight observed policy domains are resolved per completion; excess domain metadata fails closed rather than silently dropping a domain.

# Validation and scope

The final offline run passed 57 agent tests and 78 API/contract/frontend transport tests, with no failures or skips. Compilation and typechecks passed; frontend lint used the documented portable import resolver. Tests cover:

- Identical canonical results across repeated Indonesian, English and mixed-language runs despite an incorrect model draft.
- Current versus explicitly historical rules, exact activation boundaries, source replacement, and policy changes during verification and later history reads.
- Partial or wrongly typed context, exact numeric endpoints, zero/false values, contradictory ranges, and an inapplicable specific rule falling back to a valid generic rule.
- Conflicting formal claims without a winner, Director authority despite VP precedents, source provenance, scope ambiguity, mutation of tool objects and shared tool budgets.
- Verified, unavailable, removed, ambiguous and evidence-free owners; empty versus restricted retrieval; READ and personal-data grant revocation.
- Provider error classification, bounded retry headers, support-check reason validation, audit correlation and delegated-session cleanup.

These rules are deterministic for the same authorized records, structured domain/context and business time. Natural-language intent, selected retrieval queries and semantic relevance still depend on the model. Uncurated text without a validated policy claim uses the existing general grounding path. Manual external MCP/REST completions retain their existing contract and do not automatically run this hosted canonical-answer pipeline. Legacy answers without policy snapshots need a rerun to gain this additional policy-history validation. This is not a claim of complete arbitrary-language or prompt-injection correctness.

No paid or live inference was invoked. The real-model acceptance suite, official organizer cases, a production frontend bundle and interactive browser journeys remain separate validation gates. See [verification](verification.md).
