# Personal-data requests

Ordinary answers and evidence remain masked. To request an actual personal value in the connected web console, open a cited source, expand **Request a personal value**, select the category, write an explicit request, and confirm the displayed purpose. The request is bound to that source and chunk. Demo mode does not simulate permission to disclose personal data.

The web client creates an inquiry with an immutable `personal_data_request` using the shared contract. `POST /v1/inquiries/:id/run` processes this request directly in the backend, without creating a model provider or sending the question or value to cloud inference. Ordinary inquiries continue to use the configured agent.

The backend requires inquiry ownership, a current USER session, current source READ access, a matching category/purpose grant, and exactly one complete distinct value in the selected chunk. Authorization and persistence share the organization lock in one transaction. A missing grant, ambiguous value, or replaced source produces a generic insufficient-evidence answer. An unavailable source/inquiry remains indistinguishable from a nonexistent one. Completing an already completed inquiry returns a conflict.

Only the requested value appears in the answer. Citations and ordinary evidence remain redacted. Every subsequent answer read rechecks the grant; revoking the category grant masks the stored value, and revoking source READ hides the inquiry. Disclosure and answer events share the inquiry and tool-call identifiers. Audit metadata stores value/answer hashes, never the plaintext value.

Intent checks reject policy/definition questions and negated or mixed requests, and recognize common Indonesian and English category terms, including mobile/cell numbers. These conservative rules are not a general language understanding model and can reject ambiguous wording. Category selection and purpose confirmation do not create permission; only an administrator can assign the separate grant. No UI or language model can grant itself access.

Automatic pattern detection covers identifiers such as NIK, phone numbers and email. Context-dependent names, addresses, salary and health descriptions still require curator annotations at ingestion. Untagged contextual data is outside automatic detection coverage.

# Browser storage

Question text, answers and evidence are not persisted in browser storage by the console. History titles come from the backend after ownership, READ and masking checks. The console removes the legacy `vd-questions` cache when starting, activating a session, and signing out. Session cleanup runs even when logout fails. The existing bearer session stays in `sessionStorage`, and theme preference stays in `localStorage`.

# Validation limits

Offline regression covers request intent, masked history, owner/delegated session isolation, allowed and denied releases, ambiguity, grant and READ revocation, audit correlation, and zero provider calls for personal requests. Scripted provider tests do not establish real-model accuracy. The existing real-model fuel acceptance and full multilingual/injection suite still require a deliberate synthetic live evaluation when provider quota permits; no automatic retry or paid inference is introduced.
