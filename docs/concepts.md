# Core Concepts

To understand MailClaw, you only need to hold a few ideas in your head.

## 1. Room

A room is the durable truth boundary for one external email conversation.

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

Internal agent collaboration happens through virtual mailboxes and work threads.

Its constraints matter:

- replies are single-parent
- work can fan out to multiple workers
- fan-in is handled by reducers
- mailbox visibility can be scoped by role
- internal collaboration stays observable without polluting the external thread

## 3. Pre-First Memory

MailClaw does not build long-term memory on raw reasoning traces.

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

MailClaw's behavior model can be summarized like this:

1. React inside scratch space
2. Compress the result into Pre
3. Render that Pre into external mail, internal mail, approvals, or workbench views

That means:

- chain-of-thought is not long-term memory
- child transcripts are not business truth
- email bodies are not the only state in the system

## 5. Approval And Outbox

MailClaw separates side effects from reasoning.

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

## In One Sentence

MailClaw turns email into durable rooms, multi-agent collaboration into virtual mail, and long-term memory into compact Pre.
