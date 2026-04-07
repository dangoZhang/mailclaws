# Security Boundaries

MailClaws treats all inbound email, headers, and attachments as untrusted input.

## Inbound Guardrails

This first security slice enforces three checks before a message can reach orchestration:

- `sender policy`: deny rules win, allow rules are explicit, and allowlists become mandatory once configured.
- `loop guard`: auto-generated, bulk, list, and noreply-style traffic is rejected up front.
- `attachment policy`: oversized files, unsupported MIME types, and excessive attachment counts are rejected before any agent sees them.

These checks are intentionally conservative to stop mail loops, spam amplification, and unsafe attachment handling early.

## Runtime and Data Exposure

- Room kernel state, approvals, outbox intents, and replay traces are persisted and inspectable through operator surfaces.
- Sensitive provider/account configuration is redacted from default operator and model-facing views.
- Internal collaboration uses virtual mail projection and room-scoped context retrieval rather than direct raw provider payload access.

## Current Release Boundary

- Security regression tests for secrets redaction and exposure surfaces are in place and pass in this repository.
- Mail I/O currently runs in-process with the runtime in this repo; a fully isolated external mail-I/O sidecar boundary is not yet shipped.
- Do not position this release as complete hard isolation across all provider credential handling paths.

## Release Validation

- Run `pnpm test:security` for redaction and exposure regressions.
- Keep architectural truth claims aligned with [ADR-001 Architecture](./adr/ADR-001-architecture.md).
