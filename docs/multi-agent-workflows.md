# Multi-Agent Collaboration

MailClaws does not ask multiple agents to share one giant transcript.

Instead, it turns collaboration into inspectable mail-shaped objects:

- each new outside thread gets a room, and replies return to that same room
- rooms hold the durable truth and working memory for one external conversation
- virtual mail separates public-facing roles from internal worker roles
- work threads keep parallel tasks isolated
- reducers converge worker output back into one room-visible result
- approvals and outbox intents stay as the only path to real external send

## The Practical Model

When one real email arrives:

1. A new outside thread opens a new room. A reply updates the existing room.
2. The public-facing diplomat or front desk reads the latest inbound plus the latest durable Pre state.
3. If more work is needed, it sends internal task mail to worker mailboxes in that room.
4. Workers reply through single-parent internal mail.
5. A reducer or orchestrator converges the results back into the room.
6. Only then can MailClaws create an approval or governed outbox intent.

That means:

- internal collaboration is durable and replayable
- stale worker results can be discarded without corrupting the room
- external mail stays clean even when several workers participated

## Durable Agents Versus One-Off Subagents

MailClaws intentionally keeps these execution types separate:

- durable agents have their own `SOUL.md`, routing identities, and long-term memory
- one-off subagents are burst compute workers and do not keep a soul

That means:

- long-lived persona, collaboration rules, and reusable division of work belong to durable agents
- active room context belongs to the room, not to the agent
- elastic task execution belongs to subagents
- subagent output only enters the room collaboration path after it is normalized into internal reply mail

So MailClaws is not “make every agent permanent.” It is “keep durable agents for organization, keep subagents for elastic compute.”

## What To Look At In The Workbench

Open the Mail tab, then:

1. select `Rooms`
2. open one room
3. inspect these sections in order

### Room Summary

Use this to confirm:

- which account owns the room
- which front agent identity is active
- which collaborator agents or summoned roles participated

### Virtual Mail

Use this to see:

- which mailbox sent each internal message
- which role received it
- whether a message was root work or a reply
- whether cc was used
- which attachment refs or room artifacts were attached
- whether the message came from provider mail, gateway chat, or internal virtual mail

This is the clearest view of multi-agent coordination.

### Mailbox Deliveries

Use this to see:

- where each internal message was queued
- whether it was leased, consumed, stale, vetoed, or superseded

This tells you whether collaboration succeeded operationally, not just logically.

### Governed Outbox

Use this to see:

- which internal result became an external delivery candidate
- whether the outbox item is pending approval, queued, sent, or failed

This is the boundary between internal agent work and real external side effects.

### Gateway Projection

Use this when the room is linked to OpenClaw/Gateway.

It shows:

- which gateway session keys are bound to the room
- which room outcomes were projected back toward Gateway
- whether dispatch is pending, dispatched, or failed

## Mailbox Views

If you want to inspect one role mailbox directly:

1. open `Mailboxes`
2. select the mailbox
3. inspect both:
   - `Mailbox Feed`
   - `Room Thread In Mailbox`

This is useful when you want to answer:

- what did the reviewer actually see?
- what did the researcher mailbox receive?
- did the guard mailbox ever get the draft?

## Typical Patterns

### Simple Direct Reply

- one room
- one orchestrator decision
- one governed outbox intent

You will mainly inspect `Room Summary`, `Governed Outbox`, and `Timeline`.

### Parallel Worker Collaboration

- orchestrator sends several task mails
- workers answer in separate work threads
- reducer converges the results

You will mainly inspect `Virtual Mail` and `Mailbox Deliveries`.

### Approval-Gated Response

- drafter or orchestrator proposes an answer
- reviewer or guard blocks or escalates
- approval creates the release gate

You will mainly inspect `Approvals` plus the room’s `Governed Outbox`.

## CLI Surfaces

If you want the same story from the terminal:

```bash
mailclaws rooms
mailclaws replay <roomKey>
mailctl mailbox view <roomKey> <mailboxId>
mailctl mailbox feed <accountId> <mailboxId>
mailclaws approvals room <roomKey>
mailclaws trace <roomKey>
```

## What MailClaws Intentionally Avoids

MailClaws does not use:

- one shared transcript as the authority for all agents
- subject-only continuity for collaboration truth
- direct worker-to-external send
- long-lived scratch traces as durable memory

The point of the system is to make collaboration durable, inspectable, and governable.
