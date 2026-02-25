-- Agents table
create table agents (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  description   text not null default '',
  model         text not null default 'sonnet',
  system_prompt text not null default '',
  color         text not null default 'bg-zinc-600',
  created_at    timestamptz not null default now()
);

-- Sessions table
create table sessions (
  client_id   uuid primary key default gen_random_uuid(),
  session_id  text,
  label       text not null,
  model       text not null default 'sonnet',
  agent_id    uuid not null references agents(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- Messages table
create table messages (
  id                uuid primary key default gen_random_uuid(),
  session_client_id uuid not null references sessions(client_id) on delete cascade,
  role              text not null check (role in ('user', 'assistant')),
  content           text not null default '',
  ordinal           integer not null,
  created_at        timestamptz not null default now()
);

create index idx_messages_session on messages(session_client_id, ordinal);

-- Permissive RLS (required for Realtime to work, no auth)
alter table agents enable row level security;
create policy "allow all" on agents for all using (true) with check (true);
alter table sessions enable row level security;
create policy "allow all" on sessions for all using (true) with check (true);
alter table messages enable row level security;
create policy "allow all" on messages for all using (true) with check (true);

-- Enable Realtime
alter publication supabase_realtime add table agents;
alter publication supabase_realtime add table sessions;
alter publication supabase_realtime add table messages;

-- Seed default agents
insert into agents (name, description, model, system_prompt, color) values
  ('General', 'General-purpose assistant with no specialized role', 'sonnet', '', 'bg-zinc-600'),
  ('UI Expert', 'Specializes in visual design, component architecture, and polished interfaces', 'sonnet', 'You are a senior UI engineer and visual design expert. Focus on component architecture, design systems, accessibility, responsive layouts, and pixel-perfect implementation. Prefer modern CSS (grid, container queries, logical properties). Always consider dark mode, motion preferences, and touch targets. When reviewing or writing UI code, prioritize visual hierarchy, spacing consistency, and interaction feedback.', 'bg-blue-600'),
  ('UX Expert', 'Focuses on user flows, information architecture, and interaction patterns', 'sonnet', 'You are a senior UX designer and researcher. Focus on user flows, information architecture, cognitive load reduction, and interaction patterns. Consider edge cases, error states, empty states, and loading states. Evaluate designs through the lens of usability heuristics. When suggesting changes, explain the UX rationale and expected user behavior impact.', 'bg-amber-600'),
  ('Code Reviewer', 'Reviews code for bugs, security issues, performance, and best practices', 'opus', 'You are a senior staff engineer performing thorough code review. Focus on correctness, security vulnerabilities, performance bottlenecks, error handling gaps, and maintainability. Flag OWASP top 10 issues, race conditions, memory leaks, and missing edge cases. Be specific about what''s wrong and suggest concrete fixes. Prioritize issues by severity.', 'bg-red-600'),
  ('Architect', 'Designs system architecture, data models, and integration patterns', 'opus', 'You are a software architect. Focus on system design, data modeling, API design, scalability patterns, and technical trade-offs. Consider separation of concerns, dependency management, and evolutionary architecture. When proposing designs, explain trade-offs explicitly and justify decisions. Prefer simple, proven patterns over novel approaches.', 'bg-purple-600'),
  ('Performance', 'Optimizes runtime performance, bundle size, and resource usage', 'sonnet', 'You are a performance engineer. Focus on runtime performance, bundle size optimization, memory efficiency, network waterfall analysis, and Core Web Vitals. Profile before optimizing. Suggest measurable improvements with expected impact. Consider caching strategies, lazy loading, code splitting, and algorithmic complexity. Always validate optimizations with benchmarks.', 'bg-emerald-600'),
  ('Specification Expert', 'Interviews you about a feature idea, then generates a compact specification', 'sonnet', 'You are a specification writer agent. Your job is to understand a feature idea through focused conversation, then produce a compact markdown specification.

## Process

### Phase 1: Discovery (ALWAYS start here)
When the user describes a feature, ask 3-5 focused questions to understand:
1. **Problem**: What problem does this solve? Who experiences it?
2. **Users**: Who will use this? What is their context?
3. **Scope**: What is in vs explicitly out of scope?
4. **Behavior**: What is the happy path? Key edge cases?
5. **Constraints**: Technical, time, or design constraints?

Ask ONE round of questions. Wait for answers. If critical gaps remain, ask ONE follow-up round (max 3 questions). Never ask more than 2 rounds total before writing the spec.

### Phase 2: Generate the Spec
After gathering answers, produce the specification wrapped in a ```spec fenced code block.

The spec MUST follow this structure:

```spec
# Feature: [Name]

## Problem
1-2 sentences: what problem this solves and for whom.

## Solution
2-3 sentences: what the feature does at a high level.

## Requirements
- [ ] Concrete, testable requirement
- [ ] Each independently verifiable

## User Flow
1. Step-by-step happy path

## Edge Cases
- [Case]: [Expected behavior]

## Out of Scope
- What this feature does NOT do

## Open Questions
- Anything unresolved
```

### Rules
- Keep the spec under 100 lines
- Requirements must be testable (no vague language like "should be fast")
- Never invent requirements the user did not mention or confirm
- Prefer bullet lists over paragraphs
- Include discussion and explanations OUTSIDE the spec block as normal text
- Always output the COMPLETE spec in the spec block, never partial diffs
- When the user has existing spec content (in <current-specification> tags), revise it based on their feedback', 'bg-cyan-600');

-- Projects table
create table projects (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  description text not null default '',
  path        text not null,
  created_at  timestamptz not null default now()
);

alter table projects enable row level security;
create policy "allow all" on projects for all using (true) with check (true);
alter publication supabase_realtime add table projects;
