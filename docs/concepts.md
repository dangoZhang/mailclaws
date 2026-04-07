# Core Concepts

To understand MailClaws, you only need to hold a few ideas in your head.

## 1. Room

A room is the durable truth boundary and working memory for one external email conversation.

Routing rule:

- a new outside email thread creates a new room
- a reply in the same outside thread returns to the same room

What lives in a room:

- the current external thread state
- participants
- attachments and extracted evidence
- approval and delivery state
- a replayable timeline
- the latest durable Pre

Why this matters:

- email continuity should not depend on one growing chat transcript
- when a new reply arrives, old work can be marked stale safely
- operators need one source of truth for debugging and audit

## 2. Virtual Mail

Internal agent collaboration happens through virtual mail and room-scoped work threads.

Its constraints matter:

- send, reply, and cc all stay explicit
- full room history stays replayable
- attachments are referenced by room-local artifact links
- replies are single-parent
- work can fan out to multiple workers
- fan-in is handled by reducers
- mailbox visibility can be scoped by role and room participation
- internal collaboration stays observable without polluting the external thread

This is the core collaboration substrate for ReAct-Pre. If virtual mail is weak, the whole system becomes vague and unsafe.

## 3. Pre-First Memory

MailClaws does not build long-term memory on raw reasoning traces.

Instead it works like this:

- agents do temporary work in scratch space
- the result worth keeping is compressed into Pre
- the next turn loads latest inbound, latest Pre, and only the refs it needs

Pre usually contains:

- summary
- facts
- open questions
- decisions
- commitments

## 4. ReAct-Pre

MailClaws's behavior model can be summarized like this:

1. React inside scratch space
2. Compress the result into Pre
3. Render that Pre into external mail, internal mail, approvals, or workbench views

That means:

- chain-of-thought is not long-term memory
- child transcripts are not business truth
- email bodies are not the only state in the system

## 5. Approval And Outbox

MailClaws separates side effects from reasoning.

The normal path is:

1. draft
2. review / guard
3. approval
4. outbox intent
5. delivery attempt

Why this matters:

- workers cannot send mail directly
- unsafe or stale drafts do not leak out silently
- audit, trace, and replay all have one canonical path

## 6. Workbench

The Mail tab is the user-facing surface for these concepts.

Main views:

- `Mail`
- `Accounts`
- `Rooms`
- `Mailboxes`
- `Approvals`

It is not just a chat history viewer. It exposes the runtime model directly.

## 7. Durable Agents

Long-lived MailClaws agents keep identity and long-term memory. They do not carry the active room context by themselves.

Each durable agent has:

- `SOUL.md`
- `AGENTS.md`
- stable public and internal routing identities
- long-term memory that can survive across rooms

The active working state still lives in the room:

- latest inbound mail
- latest Pre
- room facts, artifacts, and attachments
- internal mail history for that room

That keeps multi-agent coordination grounded in a durable roster without pretending one agent owns the live context.

## 8. Templates And HeadCount

MailClaws supports three ways to grow an agent roster:

- built-in templates
- custom durable agents
- HeadCount recommendations inferred from repeated subagent usage

Templates are the fast starting point. HeadCount helps decide which roles should become durable once workload grows.

## In One Sentence

MailClaws turns outside email into rooms, multi-agent collaboration into virtual mail, and reusable long-term memory into compact Pre.
