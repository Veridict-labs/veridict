# Veridict

A monorepo for Veridict. The NestJS backend implements organization-scoped authentication, permissions, ingestion, retrieval, policy resolution, inquiry history, reviewed feedback, audit logs, purpose-scoped personal-data disclosure, domain-owner routing, correlated inquiry traces, and an authenticated MCP endpoint. The Next.js frontend remains a starter for Person 3.

Product specification: [Veridict PRD](Veridict_PRD_v1_Track_A.md).

The built-in Person 1 runtime uses Gemini by default (HF remains explicitly selectable). Create an inquiry, then call `POST /v1/inquiries/:id/run` as its owner to generate and persist an evidence-grounded answer. Configure backend-only `GEMINI_API_KEY` and `GEMINI_MODEL` in `apps/api/.env`; see the [Gemini setup and actual verification status](docs/gemini.md). WorkBuddy remains an optional MCP connector. A new inquiry stays pending until explicitly processed; no background queue is enabled.

## Stack

- Frontend: Next.js App Router, React, TypeScript, Tailwind CSS.
- Backend: NestJS, TypeScript.
- Data: Prisma ORM 7 and PostgreSQL 17 with pgvector via Docker Compose.
- Tooling: npm workspaces, ESLint, Prettier.

## Prerequisites

- Node.js 22.12+ (Node.js 22 LTS recommended) and npm.
- Docker Desktop for the local database.

## Getting started

Run these commands from the project root in PowerShell:

```powershell
npm ci
Copy-Item .env.example .env
Copy-Item apps/web/.env.example apps/web/.env.local
Copy-Item apps/api/.env.example apps/api/.env
npm run db:up
npm run db:deploy
npm run build
npm run dev
```

Frontend: http://localhost:3000. API: http://localhost:3001. Public liveness check: `GET /health`. The API requires PostgreSQL and applied migrations. The frontend can run independently with `npm run dev:web`.

On the first setup, create an administrator using a separate PowerShell terminal:

```powershell
$env:BOOTSTRAP_ORG_SLUG = 'veridict'
$env:BOOTSTRAP_EMAIL = 'admin@example.com'
$env:BOOTSTRAP_PASSWORD = Read-Host 'Choose a password (at least 12 characters)' -MaskInput
npm run admin:bootstrap
Remove-Item Env:BOOTSTRAP_PASSWORD
```

The bootstrap command creates a new organization and administrator; an existing slug is rejected. There are no default accounts or public registration. See the [backend integration guide](docs/backend.md) for login, ingestion, and MCP examples.

Default ports: frontend **3000**, backend **3001**, PostgreSQL **5432**. If you already have a local PostgreSQL instance, use that connection and skip `npm run db:up`; ensure the `vector` extension is available when implementing retrieval. If you change credentials or the port in the root `.env`, update `DATABASE_URL` in `apps/api/.env` accordingly. The example credentials are for local development only.

## Commands

| Command                                                       | Purpose                                          |
| ------------------------------------------------------------- | ------------------------------------------------ |
| `npm run dev`                                                 | Run the frontend and backend in watch mode       |
| `npm run dev:web`                                             | Run the frontend only                            |
| `npm run dev:api`                                             | Run the backend only                             |
| `npm run build`                                               | Build both applications                          |
| `npm run typecheck`                                           | Check TypeScript in both applications            |
| `npm run lint`                                                | Run ESLint on both applications                  |
| `npm run format`                                              | Format source files and configuration            |
| `npm run db:up`                                               | Start the database and wait until it is ready    |
| `npm run db:down`                                             | Stop the database and preserve its data volume   |
| `npm run db:generate`                                         | Generate Prisma Client after adding models       |
| `npm run db:migrate --workspace @veridict/api -- --name init` | Create and apply a migration after adding models |
| `npm run db:studio`                                           | Open Prisma Studio                               |

Additional backend commands:

| Command                   | Purpose                                                             |
| ------------------------- | ------------------------------------------------------------------- |
| `npm run db:deploy`       | Apply committed database migrations                                 |
| `npm run admin:bootstrap` | Create a new organization and administrator after building          |
| `npm run test:api`        | Run unit and isolated PostgreSQL/MCP integration tests              |
| `npm run test:agent`      | Test the Person 1 MCP client against local HTTP/MCP fixtures        |
| `npm run agent:smoke`     | Check a running API with a delegated user token; see Person 1 setup |

The Prisma schema includes organizations, users, sessions, knowledge sources, chunks, permissions, policy claims, cases, inquiries, feedback, and audit events. Generate the client after schema changes; commit migrations alongside the schema.

Both the initial migration and `infra/postgres/init.sql` enable the `vector` extension. Vector search uses caller-supplied embeddings with an explicit model identifier and matching dimensions. Without a query embedding, retrieval is lexical. No embedding provider is configured.

## Project structure

```text
apps/
  web/                 # Next.js starter
  api/                 # NestJS backend and integration tests
    prisma/            # Data models and committed migrations
packages/contracts/    # Shared TypeScript types and Zod input schemas
packages/agent/        # Person 1 MCP connection checks and tests
integrations/workbuddy/ # Agent instructions and connector template
docs/                  # Backend API, architecture, accountability
infra/postgres/        # pgvector extension initialization
compose.yaml
```

Person 1 and Person 3 can import `@veridict/contracts`. Streamable HTTP MCP is exposed at `/mcp`; connecting the actual WorkBuddy runtime still requires a live integration check.

Tests create and remove their own PostgreSQL container on an automatically assigned test port. They do not use the development database or change the configured application ports. Docker must be running and the `pgvector/pgvector:pg17` image must be available (`docker pull pgvector/pgvector:pg17` if needed).

- [Backend integration guide and limits](docs/backend.md)
- [Person 2 checklist and Person 1 handoff](docs/person-2-checklist.md)
- [Team task division and implementation plan](docs/team-task-division.md)
- [Person 1 runtime checkpoints](docs/person-1-checkpoints.md)
- [Gemini runtime and setup](docs/gemini.md)
- [Optional Hugging Face provider](docs/huggingface.md)
- [Architecture and trust boundaries](docs/architecture.md)
- [Accountability](docs/accountability.md)
- [Shared demo fixtures and seed](docs/demo-fixtures.md)

## Setup references

- [Next.js via Context7](https://context7.com/vercel/next.js)
- [NestJS](https://docs.nestjs.com/first-steps)
- [Prisma PostgreSQL and driver adapters](https://www.prisma.io/docs/orm/v7/core-concepts/supported-databases/postgresql)

Context7 MCP was unavailable during setup. The Next.js reference was accessed through the Context7 website, with official documentation used as a supplement.
