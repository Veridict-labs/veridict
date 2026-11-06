# Gemini runtime

Primary provider, 6 November 2026: NestJS AgentService + Gemini. WorkBuddy remains an optional external MCP client. HF requires explicit selection and is never an automatic fallback.

## Local setup

Keep these values in ignored apps/api/.env, never in frontend variables or Git:

```dotenv
AI_PROVIDER=gemini
GEMINI_API_KEY=<your local Google AI Studio key>
GEMINI_MODEL=gemini-3.5-flash
```

The API defaults to Gemini and this model. An invalid provider or missing selected-provider key fails locally. A configured HF token cannot silently replace Gemini. Restart the API after changing environment variables. Existing keys are not copied to tracked files.

Use a project with Free Tier and active quota to avoid paid inference. The application cannot determine the project's billing tier from its key. Do not enable paid billing to fix an error unless that is your intended choice. Google lists free input/output for this model, subject to account/model quota; this is not unlimited usage. Free-tier content may be used to improve Google products, so the live evaluator uses only synthetic fixtures.

The old gemini-2.5-flash-lite model was listed by the models API but returned 404 for this new account. Its error recommended gemini-3.5-flash-lite, which passed a small preflight. The selected gemini-3.5-flash subsequently completed a full application request (HTTP 201), but its answer failed the fuel acceptance check after safe abstention.

Official references checked on 6 November 2026: [pricing](https://ai.google.dev/gemini-api/docs/pricing?hl=en), [rate limits](https://ai.google.dev/gemini-api/docs/rate-limits?hl=en), [compatibility endpoint](https://ai.google.dev/gemini-api/docs/openai?linkId=13271420), [thought signatures](https://ai.google.dev/gemini-api/docs/thought-signatures).

## Runtime contract and limits

Create an inquiry with POST /v1/inquiries, then call POST /v1/inquiries/:id/run with an empty JSON body from its owner's USER session. Read the stored result and correlated trace afterward. Person 3 can keep the existing REST integration; provider/model/call count reflect the selected runtime.

Requests use the fixed Google compatibility endpoint, server-side fetch, no OpenAI SDK/key, 30-second per-call timeout, bounded response size and output tokens. Tool-only replies may omit content. Opaque Google thought signatures are preserved between model turns in request memory; they are not exposed in answer or audit metadata. Only the whitelisted evidence services can execute. Model arguments remain strict Zod contracts.

The agent permits at most six orchestration calls plus one support check, twelve tool calls, four calls per response, and bounded evidence/context. Search is lexical and exact-word; instructions cover short multilingual queries. Identity/inquiry selection, permissions, masked evidence and persistence stay owned by the backend. Every model-exposed chunk participates in reauthorization and stored-history dependencies. Support checking is a same-model heuristic, not a proof of factual correctness.

No retries, top-ups, model switching or provider fallback happen automatically. On failure, no answer is persisted and the temporary session is released. Safe errors include AI_NOT_CONFIGURED, AI_REQUEST_REJECTED (400), AI_AUTH_FAILED (401), AI_ACCESS_DENIED (403), AI_MODEL_UNAVAILABLE (404), AI_RATE_LIMITED (429), and AI_UNAVAILABLE (including 503). A 429 can mean a quota limit as well as a short rate limit; inspect the project's AI Studio quota before retrying. Raw provider bodies and credentials are not returned.

## Verification

Ordinary tests never call cloud inference:

```powershell
npm run test:agent
npm run test:api
npm run lint
npm run typecheck
```

Opt-in synthetic evaluation creates and removes its own PostgreSQL container:

```powershell
$env:AI_LIVE_TEST = '1'
npm run test:ai:live
# Optional five-scenario evaluation after reviewing the first answer:
npm run test:ai:live -- --all
Remove-Item Env:AI_LIVE_TEST
```

The runner stops after a provider/runtime error. Reports under docs/evaluation contain synthetic content, checks and trace summaries, with both providers' keys redacted. Do not confuse successful model preflight with successful end-to-end answering. See [current checkpoints](person-1-checkpoints.md) and [verification](verification.md) for actual results.

Actual results: 36 agent tests and 46 backend tests pass. The Flash application run [completed with HTTP 201](evaluation/gemini-live-2026-11-06T12-13-03-584Z.json), but safe abstention failed the fuel answer acceptance check. After improving verifier context, [the next evaluation](evaluation/gemini-live-2026-11-06T12-15-03-878Z.json) stopped on provider 429 before completing its first scenario. No further cloud calls were made. The full live suite and the latest verifier behavior remain unaccepted.
