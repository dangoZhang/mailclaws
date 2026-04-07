# Release Notes: v0.1.0

MailClaws `v0.1.0` is the first cleaned release cut from the current email-native runtime branch.

## Headline

MailClaws ships as an email-native runtime for durable rooms, virtual internal mail, approval-gated delivery, and workbench-grade replay.

## What Is In v0.1.0

- Room-first truth with durable replay, revision history, recovery, quarantine, dead-letter, resend, and approval flows.
- Virtual mail plane for internal agent collaboration with mailbox projections, single-parent replies, and reducer-based fan-in.
- Pre-first room memory, so orchestrator prompts carry forward durable summaries/facts instead of replaying full transcripts by default.
- Provider connectivity for IMAP, Gmail, SMTP, raw RFC822 ingest, and OAuth login flows for Gmail and Outlook.
- Mail workbench surfaces through `/workbench/mail`, `mailctl`, replay traces, provider/mailbox inspection, and gateway projection visibility.
- Release packaging for source, tarball, npm tarball, and Homebrew formula generation.

## Prompt Footprint

Repository-local benchmark results included in this release:

- Long-thread follow-up average: `755` estimated tokens vs `2006` transcript-first baseline, `62.3%` lower.
- Turn-6 long-thread follow-up: `752` vs `2868`, `73.8%` lower.
- 5-worker reducer handoff: `750` vs `3444`, `78.2%` lower.

Run locally:

```bash
mailctl benchmark prompt-footprint
mailctl --json benchmark prompt-footprint
```

## Verified Before Cut

This release was validated with:

```bash
pnpm check
pnpm docs:build
pnpm package:release
```

Observed result at cut time:

- `62` test files passed
- `334` tests passed
- `2` live-provider smoke tests were skipped because they require real credentials

One-click local release command:

```bash
pnpm release:ship
```

## Release Assets

- Runtime bundle: `output/release/mailclaws-v0.1.0/`
- Tarball: `output/release/mailclaws-v0.1.0.tar.gz`
- npm tarball: `output/release/npm/mailclaws-0.1.0.tgz`
- Homebrew formula: `output/release/homebrew/mailclaws.rb`
- Checksums: `output/release/checksums.txt`

## Install

Local release assets:

```bash
npm install -g ./output/release/npm/mailclaws-0.1.0.tgz
pnpm setup
pnpm add -g "file://$PWD/output/release/npm/mailclaws-0.1.0.tgz"
brew install ./output/release/homebrew/mailclaws.rb
```

For `pnpm add -g`, use an absolute path or `file://` URL for the local tarball. Local Homebrew installs still require Homebrew to reach its own download infrastructure.

From source:

```bash
pnpm install
pnpm dev
```

## Current Boundaries

- `/workbench/mail` is the shipped Mail workbench surface, but it is not a full Outlook-style mailbox client.
- Live provider smoke still requires real mailbox credentials and provider-side setup.
- Gateway/workbench full upstream automation is not claimed as complete end-to-end in this release.

## Suggested GitHub Release Body

```md
MailClaws v0.1.0 ships as an email-native runtime for durable rooms, virtual internal mail, approval-gated delivery, and workbench-grade replay.

Highlights
- Room-first truth with replay, recovery, quarantine, resend, and approval flows
- Virtual mail plane for internal multi-agent collaboration
- Pre-first room memory instead of transcript-first prompt growth
- IMAP/Gmail/SMTP/raw-RFC822 provider support plus Gmail/Outlook OAuth login
- `/workbench/mail` and `mailctl` Mail workbench surfaces
- Release artifacts for tarball, npm package, and Homebrew formula

Prompt footprint benchmark
- Long-thread follow-up average: 62.3% lower than a transcript-first baseline
- Turn-6 follow-up: 73.8% lower
- 5-worker reducer handoff: 78.2% lower

Verification
- pnpm check
- pnpm docs:build
- pnpm package:release

Known boundaries
- `/workbench/mail` is read-only
- live provider smoke requires real credentials
- no claim of full Outlook-like mailbox parity yet
```
