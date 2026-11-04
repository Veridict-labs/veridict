# Shared synthetic demo fixtures

`apps/api/fixtures/demo.json` is the common source of scenarios for backend, WorkBuddy integration, and frontend development. It is explicitly synthetic and contains no organizer test results or real personal records. `apps/api/fixtures/ui-answers.json` provides contract-validated frontend answer mocks; its placeholder UUIDs must not be submitted to the live API.

## Seed a new demo organization

Configure `apps/api/.env` for the intended development database and apply migrations first. Then run from the repository root in PowerShell:

```powershell
npm run db:deploy
npm run build
$env:ALLOW_DEMO_SEED = 'true'
$env:DEMO_ORG_SLUG = 'veridict-demo'
$env:DEMO_PASSWORD = Read-Host 'Demo account password (12+ characters)' -MaskInput
npm run demo:seed
Remove-Item Env:DEMO_PASSWORD
Remove-Item Env:ALLOW_DEMO_SEED
```

The seed runs without an HTTP listener, creates a new organization, and uses backend services to ingest sources, validate claims/cases, curate a directory owner, and assign purpose-specific disclosure grants. It prints a manifest of real IDs, source aliases, user emails, questions, and expected backend outcomes. It does not print passwords or tokens. All demo users use the explicitly supplied demo password; use only for synthetic development data.

Existing organization slugs are rejected; the command never resets or deletes existing data. Use a different slug for a new copy. A failed seed may leave its new organization partially populated; resolve the error and use a new slug rather than assuming a clean rerun. The integration suite seeds into an isolated database and verifies the resulting scenarios.

## Shared scenarios

| Scenario key     | Actor    | Expected behavior                                                                                   |
| ---------------- | -------- | --------------------------------------------------------------------------------------------------- |
| `fuel_conflict`  | employee | Approved Rp750000 HR update supersedes Rp500000 SOP; preserve both citations in an agent answer     |
| `restricted`     | employee | Kenari search returns no evidence and no existence hint                                             |
| `missing`        | employee | Agent abstains for an unsupported allowance; authorized fuel owner is available for handoff         |
| `reconciliation` | employee | Director remains official; synthetic ledger has 23 VP cases out of 26; flag the policy/practice gap |
| `multi_source`   | employee | Onboarding retrieval includes document, chat, and task; agent synthesis remains an integration test |
| `phone_allowed`  | employee | Explicit phone request with source READ and CONTACT_PERSON grant can reveal only the phone          |
| `nik_denied`     | employee | Source READ and an explicit identity request do not reveal NIK without a separate grant             |

Accounts are `admin@example.test`, `employee@example.test`, `reviewer@example.test`, and `executive@example.test`, scoped to the configured demo organization. The executive can read the restricted source; the employee cannot. The private profile uses fictional values and tagged contextual data. No embedding provider is called; demo retrieval is lexical unless an integrator supplies actual model-matched vectors.

Person 1 can create inquiries from the seeded scenarios, request inquiry-bound tool tokens, and exercise MCP with the manifest's IDs. Person 3 can start with the UI mocks and later replace placeholder IDs with the seed manifest. The seed does not fabricate completed live inquiries, call WorkBuddy, or establish multilingual answer quality.
