# RenLab

A web UI for managing AI-powered coding pipelines. Write specifications, run automated code-review-retry loops with Claude, and track everything in a dashboard.

Built with Next.js, Supabase, and [node-claude-sdk](https://github.com/cellexec/node-claude-sdk).

## Features

- **Projects** — manage multiple codebases
- **Specifications** — define what you want built in natural language
- **Pipelines** — automated coding + review loop (worktree isolation, retry on low scores, auto-merge on pass)
- **Chat** — interactive Claude sessions scoped to a project
- **Usage** — view Claude Code usage stats

## Setup

### Prerequisites

- Node.js 18+
- [Supabase CLI](https://supabase.com/docs/guides/cli) (for local dev)
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) installed and authenticated

### Install

```bash
# Clone both repos side by side
git clone git@github.com:cellexec/renlab.git
git clone git@github.com:cellexec/node-claude-sdk.git

# Install SDK
cd node-claude-sdk && npm install && npm run build && cd ..

# Install RenLab
cd renlab && npm install
```

### Database

```bash
supabase start
```

Migrations run automatically. See `supabase/migrations/` for the schema.

### Environment

```bash
cp .env.example .env.local
# Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
```

### Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Project Structure

```
app/
  api/          API routes (chat, pipelines, usage)
  pipelines/    Pipeline dashboard and detail views
  specifications/  Spec editor and listing
  projects/     Project management
  chat/         Chat interface
  components/   Shared UI components
  lib/          Core logic (pipeline manager, supabase client)
supabase/
  migrations/   Database migrations
  config.toml   Supabase local config
```

## License

MIT
