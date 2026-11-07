# Answer modes

In the connected frontend, choose **AI on** or **AI off · Tanpa AI** above the question field on Home or Ask. The chosen mode belongs to that inquiry, survives page reloads, and is shown on its detail page. Asking again after evidence changes preserves the choice. Demo mode continues to use labeled synthetic fixtures.

- **AI on** uses the configured Gemini/Hugging Face runtime to interpret the question and check evidence.
- **AI off** extracts literal keywords, searches authorized sources using existing lexical retrieval, and returns up to five masked source excerpts with citations. No inference provider is initialized; no Gemini/HF API key is needed. Authentication, PostgreSQL and the backend are still required.

AI-off results are excerpts, not a synthesized or verified policy decision. Source states are displayed, including draft and superseded states. This mode does not infer synonyms, choose applicable policy context, reconcile conflicts, or decide which rule applies. It returns `ANSWERED` when it can show matching excerpts and `INSUFFICIENT_EVIDENCE` for no matches. The frontend skips the rule-check step and labels the result as source excerpts. Matching an inaccessible topic is indistinguishable from matching nothing.

Create with `POST /v1/inquiries`:

```json
{ "question": "Berapa tunjangan bensin saya?", "processing_mode": "no_ai" }
```

Then call `POST /v1/inquiries/:id/run` with `{}` using the owner's USER session. The backend reads the persisted mode; the run body cannot select a provider or change it. Existing clients that omit the mode continue to use AI. Personal-data requests keep their dedicated authorization path, which already avoids inference regardless of the selected mode.

AI-off runs use inquiry-bound delegated sessions and the same masking, citation authorization, history access and session cleanup as AI runs. The trace records `NO_AI_RUN_STARTED`, `KNOWLEDGE_SEARCH` (when there are keywords), and `NO_AI_RUN_COMPLETED` with `model_calls: 0`. Runtime failures record `NO_AI_RUN_FAILED`. The response has `provider: null` and `model: null`.

Apply the new database migration before running the updated backend:

```powershell
npm run db:deploy
```

The migration adds an inquiry mode with default `ai`; existing history remains in that mode. Integration regressions cover real retrieval, zero provider initialization, masking, mode validation/defaulting, delegated-session and owner checks, inaccessible/missing topics, and history revocation. Unit tests cover keyword extraction, bounded excerpts and abstention.
