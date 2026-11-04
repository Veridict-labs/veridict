# Veridict

A starter monorepo for the Knowledge Guardian frontend and backend. Application features, domain models, authentication, and WorkBuddy/MCP integration have yet to be implemented.

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
npm install
Copy-Item .env.example .env
Copy-Item apps/web/.env.example apps/web/.env.local
Copy-Item apps/api/.env.example apps/api/.env
npm run db:up
npm run dev
```

Frontend: http://localhost:3000. Backend: http://localhost:3001 (the default `Hello World!` response). Both applications can run without a database while the starter does not use it.

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

The Prisma schema is intentionally empty. There are no migrations or database services registered in NestJS yet. When implementing the data layer, use `PrismaPg` from `@prisma/adapter-pg` to initialize Prisma Client; both dependencies are already installed.

`infra/postgres/init.sql` enables the `vector` extension when the database volume is first initialized. The embedding model and vector dimensions have yet to be selected.

## Project structure

```text
apps/
  web/                 # Next.js starter
  api/                 # NestJS starter
    prisma/            # Initial schema configuration
infra/postgres/        # pgvector extension initialization
compose.yaml
```

Shared contracts can be added in a `packages/` workspace once the team agrees on the interfaces. WorkBuddy/MCP integration has yet to be implemented.

## Setup references

- [Next.js via Context7](https://context7.com/vercel/next.js)
- [NestJS](https://docs.nestjs.com/first-steps)
- [Prisma PostgreSQL and driver adapters](https://www.prisma.io/docs/orm/v7/core-concepts/supported-databases/postgresql)

Context7 MCP was unavailable during setup. The Next.js reference was accessed through the Context7 website, with official documentation used as a supplement.
