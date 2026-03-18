# RTM Class AI Service

AI generation service for RTM Class, built with TypeScript and Fastify runtime (`@nestjs/platform-fastify`).

## Overview

This service accepts uploaded material, generates learning content, and persists output through Prisma or MCP tools.

Current API endpoints:
- `GET /` health check
- `POST /api/oauth/token` issue OAuth client-credentials access token
- `POST /api/mcq` generate multiple-choice questions
- `POST /api/essay` generate essay questions
- `POST /api/summary` generate summary text

## Tech Stack

- Node.js 20+
- TypeScript
- NestJS (with Fastify adapter)
- Prisma + PostgreSQL
- LangChain + LangGraph
- Groq (`@langchain/groq`)
- MCP client (`@modelcontextprotocol/sdk`)
- Zod validation

## Prerequisites

- Node.js 20 or newer
- PostgreSQL database
- Groq API key
- MCP server (streamable HTTP) if `mcp_enabled=true`

## Environment Variables

Defined in [`src/config/config.schema.ts`](src/config/config.schema.ts) and example in [`.env.example`](.env.example):

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `DATABASE_URL` | Yes | - | PostgreSQL connection string for Prisma. |
| `GROQ_API_KEY` | Yes | - | API key for Groq model calls. |
| `PORT` | No | `5001` | HTTP port for Fastify server. |
| `MCP_SERVER_URL` | Yes (practically when MCP enabled) | - | MCP endpoint URL used by the AI save tools. |
| `CORS_ORIGIN` | No | `*` | Comma-separated CORS origins. |
| `OAUTH_CLIENT_ID` | Yes | - | OAuth client ID for token issuance. |
| `OAUTH_CLIENT_SECRET` | Yes | - | OAuth client secret for token issuance. |
| `OAUTH_ALLOWED_SCOPES` | Yes | - | Space-separated allowed scopes. |
| `OAUTH_ACCESS_TOKEN_TTL` | No | `300` | Access-token TTL (seconds). |
| `JWT_SECRET` | Yes | - | JWT verification/signing secret. |
| `JWT_ISSUER` | No | `my-backend` | Expected token issuer (`iss`). |
| `JWT_AUDIENCE` | No | `rtm-class-ai` | Expected token audience (`aud`). |

## Quick Start

1. Install dependencies:

```bash
npm install
```

2. Create env file:

```bash
cp .env.example .env
```

PowerShell:

```powershell
Copy-Item .env.example .env
```

3. Generate Prisma client and apply migrations:

```bash
npx prisma generate
npx prisma migrate dev
```

4. Run in development:

```bash
npm run start:dev
```

The service listens on `http://localhost:5001` by default.

## Docker

`docker-compose.yml` uses profiles:

```bash
# development container
docker compose --profile dev up --build

# production app container
docker compose --profile prod up --build ai

# run production migration job
docker compose --profile prod run --rm ai-migrate
```

## Authentication

- `GET /` and `POST /api/oauth/token` are public.
- All other `/api/*` routes require `Authorization: Bearer <token>`.
- JWT is validated against `JWT_SECRET`, `JWT_ISSUER`, and `JWT_AUDIENCE`.
- OAuth token endpoint supports only `grant_type=client_credentials`.

### OAuth Request

`POST /api/oauth/token`

Body fields:
- `grant_type` (required, must be `client_credentials`)
- `client_id` (required)
- `client_secret` (required)
- `scope` (required, space-separated, must be subset of `OAUTH_ALLOWED_SCOPES`)

## AI Generation Endpoints

All endpoints are `multipart/form-data` and require:
- `job_id` (string)
- `material_id` (string)
- `file` (uploaded file)
- `mcp_enabled` (optional, default `false`)

### `POST /api/mcq`

Optional field:
- `mcq_count` integer `1..100` (default `5`)

### `POST /api/essay`

Optional field:
- `essay_count` integer `1..100` (default `5`)

### `POST /api/summary`

Optional field:
- `summary_max_words` integer `50..2000` (default `200`)

Each endpoint returns immediate async-accept response:

```json
{
  "success": true,
  "message": "MCQ job received and processing in background",
  "job_id": "job-123"
}
```

## Processing Behavior

1. Request is accepted and processed asynchronously (fire-and-forget in process).
2. File is read from multipart payload.
3. PDF files are extracted with `pdf-parse`; non-PDF files are read as UTF-8 text.
4. LangChain agent generates structured output in Bahasa Indonesia.
5. Output is normalized to target schema.
6. Save path:
- If `mcp_enabled=true`: calls MCP tool (`save_mcq_output`, `save_essay_output`, `save_summary_output`).
- If `mcp_enabled=false` (default): saves directly to `AIOutput` table and marks `AIJob` as `succeeded`.

On processing failure, job status is updated to `failed_processing` with `lastError`.

## Important Notes

- This service does not expose callback/webhook delivery endpoints.
- This service does not expose a job-status polling endpoint.
- `job_id` and `material_id` are expected to reference existing records in your database/MCP flow.
- Current implementation reliably handles PDF extraction; other file types are treated as plain text bytes.

## Useful Commands

```bash
# build
npm run build

# run production build
npm run start:prod

# lint
npm run lint

# unit tests
npm run test

# e2e tests
npm run test:e2e
```
