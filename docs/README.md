# Veridict documentation

Start with the [project README](../README.md) for the product walkthrough, recorded results, Challenge A mapping and local setup.

| Guide | Contents |
| --- | --- |
| [Product specification](../Veridict_PRD_v1_Track_A.md) | Scope, acceptance cases, personas and runtime decisions |
| [Architecture and trust boundaries](architecture.md) | Identity, access, retrieval, backend services, model context and audit |
| [Policy orchestration](policy-orchestration.md) | Canonical decisions, context, snapshots, owner routing and determinism limits |
| [Privacy flow](privacy-flow.md) | Masking, category/purpose grants, disclosure and browser storage |
| [Accountability](accountability.md) | Accessible data, autonomous behavior, human authority, prohibited actions and limits |
| [Answer modes](answer-modes.md) | AI on/off, excerpts, demo distinction and migration |
| [Backend integration](backend.md) | Authentication, REST/MCP, ingestion, grants and review |
| [Gemini runtime](gemini.md) | Primary provider configuration, safe errors and live evaluation |
| [Hugging Face runtime](huggingface.md) | Explicit alternative provider and known quota constraints |
| [Synthetic demo fixtures](demo-fixtures.md) | Actors, source aliases, scenarios, seed and expected outcomes |
| [Verification](verification.md) | Dated regression results, methods, failures and pending acceptance |
| [Runtime checkpoints](person-1-checkpoints.md) | Hosted-agent implementation and real-model acceptance status |
| [Backend handoff](person-2-checklist.md) | Responsibilities and integration checkpoints |
| [Team implementation plan](team-task-division.md) | Ownership, contracts, milestones and acceptance |
| [External-agent instructions](../integrations/workbuddy/agent-instructions.md) | WorkBuddy/MCP workflow and boundaries |
| [Connector template](../integrations/workbuddy/mcp.example.json) | Example configuration without real credentials |

The [cover](assets/veridict-cover.svg) is an original static SVG product illustration using the console's teal palette. It is not an application screenshot or evidence of a live run.

Offline checks do not establish real-model accuracy, organizer scores or complete prompt-injection resistance. Consult each dated checkpoint before reusing a result or claiming end-to-end acceptance.
