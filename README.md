# MailClaws

<p align="center">
  Multi-agent email. Clear rooms. Visible handoffs. Smaller prompts.
</p>

<p align="center">
  <a href="./README.md"><strong>English</strong></a> ·
  <a href="./README.zh-CN.md">简体中文</a> ·
  <a href="./README.fr.md">Français</a>
</p>

<p align="center">
  <a href="https://dangozhang.github.io/mailclaws/">Website</a> ·
  <a href="https://github.com/dangoZhang/mailclaws/actions/workflows/ci.yml">CI</a> ·
  <a href="https://github.com/dangoZhang/mailclaws/actions/workflows/release.yml">Release</a>
</p>

<p align="center">
  <img src="./docs/public/mailclaws-poster.svg" alt="MailClaws poster showing one public inbox coordinating multiple internal agents through visible internal mail, rooms, and governed delivery." width="960" />
</p>

MailClaws turns email into a real multi-agent runtime.

One thread becomes one room.  
One front agent can pull in many specialist agents.  
Every handoff stays visible.  
Every reply stays traceable.  
Every send stays governed.

Built for shared inboxes, long-running threads, rapid room switching, and work that needs progress updates before it needs a final answer.

## Why People Notice It Fast

Most agent tools hide the collaboration. MailClaws puts it on the table.

You can see the room.  
You can see the internal mail.  
You can see the review path.  
You can see what was blocked, approved, or sent.

It feels less like one giant hidden run.  
It feels more like a real team working the inbox.

## The Signature Advantage

MailClaws keeps prompts small without making work dumb.

It carries forward compact Pre state instead of replaying the whole transcript every turn. In the benchmark, long-thread follow-ups drop from **2006** estimated tokens to **755** on average. Turn-6 follow-ups drop from **2868** to **752**. A 5-worker reducer handoff drops from **3444** to **750**.

That is not just cheaper. It is what makes multi-agent email feel calm at scale.

## Why Email Works

Email already has the right shape.

- clear context boundaries
- traceable history
- easy sharing
- natural message size
- familiar work habits
- no new collaboration ritual

Users already know how to work in threads. MailClaws starts there.

## What You Actually Get

- durable rooms instead of disposable chat state
- visible internal mail instead of hidden subagent runs
- ACK, progress, review, approval, and send in one flow
- durable agents with `SOUL.md`, mailbox identity, and memory boundaries
- burst subagents for compute-only spikes
- a Workbench Mail tab that shows the whole chain

## Three Minutes To Your First Agent Email

```bash
./install.sh
MAILCLAW_FEATURE_MAIL_INGEST=true mailclaws
```

In a second terminal:

```bash
mailclaws onboard you@example.com
mailclaws login
mailclaws dashboard
```

Then do this:

1. Connect any mailbox you already use.
2. Send one email to it from another mailbox.
3. Open the Workbench and click `Mail`.
4. Watch the room appear, the internal collaboration happen, and the reply chain form.
5. Let your agents send you their first real email through the governed outbox flow.

If you want a safe local walkthrough first, run `pnpm demo:mail` and open `http://127.0.0.1:3020/workbench/mail`.

## Start Fast

Templates exist for one reason: fast setup.

- `One-Person Company` gives you a front desk plus durable specialist peers, adapted from the operating style popularized by <https://github.com/cyfyifanchen/one-person-company>.
- `Three Provinces, Six Departments` gives you a larger review-and-governance roster aligned to the `Edict` structure at <https://github.com/cft0808/edict>.

Template implementation lives here:

- <https://github.com/dangoZhang/mailclaws/blob/main/src/agents/templates.ts>

When you apply the larger roster, generated `SOUL.md` files include upstream alignment notes and role contracts so the team shape stays intentional instead of drifting into a name-only homage.

## Website And Workbench

- Website: <https://dangozhang.github.io/mailclaws/>
- Workbench: run `mailclaws dashboard`, sign in, and click `Mail`

The website explains the model.  
The Workbench shows it live.

## License

MIT. See [LICENSE](./LICENSE).
