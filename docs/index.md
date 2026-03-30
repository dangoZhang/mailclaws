---
layout: home

hero:
  name: MailClaws
  text: Multi-agent email that keeps its shape
  tagline: MailClaws turns every real email thread into a durable room, keeps agent collaboration visible as internal mail, and carries long-running work forward with compact Pre state instead of a bloated transcript.
  actions:
    - theme: brand
      text: Start In 3 Minutes
      link: /getting-started#three-minute-first-mail
    - theme: alt
      text: Open The Workbench
      link: /operator-console
    - theme: alt
      text: Core Concepts
      link: /concepts

features:
  - title: Multi-Agent Work You Can Actually See
    details: One public inbox can coordinate many specialist agents through internal mail, work threads, reviews, approvals, and reducer-driven convergence.
  - title: Rooms Keep The Truth Stable
    details: One real thread becomes one durable room with revisioned state, replayable history, and explicit stale discard when the conversation moves again.
  - title: Smaller Prompts Over Time
    details: MailClaws keeps durable Pre state instead of replaying the full transcript, so switching rooms and reporting progress stays practical.
  - title: Email Fits Human Workflows
    details: The medium already has natural context boundaries, traceable history, shareable threads, and a working style users already understand.
  - title: Governed Delivery By Default
    details: Real external sends stay behind review, approval, and outbox control even when many internal agents help shape the answer.
---

## Why MailClaws

MailClaws is built for the moment when one agent is no longer enough, but one giant opaque swarm is still unacceptable.

It lets a front agent receive the room, bring in specialist agents by internal mail, collect evidence and drafts through visible reply chains, and keep the whole story attached to the same room. That is why it works so well for long-running inbox work: the collaboration is real, but the external thread stays clean.

## Why Email Works So Well

Email already gives multi-agent systems what they need most: a clean boundary, a traceable history, a shareable thread, and a rhythm people already understand. A message is large enough to hold a real unit of work, small enough to resist context bloat, and familiar enough that users do not need a new collaboration ritual before they can start.

## A Real Advantage, Not Just A New Wrapper

MailClaws stays practical under load because it carries compact Pre state instead of replaying the whole transcript every turn. In the repository benchmark, long-thread follow-ups drop from `2006` estimated tokens to `755` on average, turn-6 follow-ups drop from `2868` to `752`, and a 5-worker reducer handoff drops from `3444` to `750`. That is what makes room switching, progress updates, and visible multi-agent work sustainable instead of expensive theater.

## Three-Minute First Mail

1. Connect one mailbox you already use.
2. Send it one test email from another mailbox.
3. Open the Workbench and click `Mail`.
4. Watch the room appear, the internal collaboration unfold, and the reply chain form.
5. Let your agents send their first governed email back out.

See [Getting Started](./getting-started.md) for the shortest path.

## Start Here

- [Website Guide](./getting-started.md)
- [Workbench Guide](./operator-console.md)
- [Core Concepts](./concepts.md)
- [Multi-Agent Collaboration](./multi-agent-workflows.md)
