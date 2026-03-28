# Live Provider Smoke

这份 runbook 对应 `testplan1.md` 里的 `T23/T24`。目标不是在默认 CI 里跑真实邮箱，而是在有真实凭据时提供一条可执行的 smoke 路径。

## Command

```bash
pnpm test:live-providers
```

默认情况下这两个 live smoke 都会跳过。只有环境变量齐全时才会执行。

建议的预检查顺序：

```bash
pnpm mailctl connect providers
curl -s http://127.0.0.1:3000/api/connect
pnpm mailctl observe accounts
```

## T23: Live IMAP + SMTP

需要这些环境变量：

- `MAILCLAW_LIVE_IMAP_HOST`
- `MAILCLAW_LIVE_IMAP_PORT`
- `MAILCLAW_LIVE_IMAP_SECURE`
- `MAILCLAW_LIVE_IMAP_USERNAME`
- `MAILCLAW_LIVE_IMAP_PASSWORD`
- `MAILCLAW_LIVE_IMAP_MAILBOX`
- `MAILCLAW_LIVE_IMAP_ADDRESS`
- `MAILCLAW_LIVE_SMTP_HOST`
- `MAILCLAW_LIVE_SMTP_PORT`
- `MAILCLAW_LIVE_SMTP_SECURE`
- `MAILCLAW_LIVE_SMTP_USERNAME`
- `MAILCLAW_LIVE_SMTP_PASSWORD`
- `MAILCLAW_LIVE_SMTP_FROM`
- `MAILCLAW_LIVE_SMTP_TO`

可选：

- `MAILCLAW_LIVE_IMAP_CHECKPOINT`

自动断言：

- 能连上真实 IMAP 并返回合法 batch
- 能得到 durable `uidValidity`
- 能通过真实 SMTP 发出一封 MailClaw outbox message

人工补充检查：

- 用真实测试邮箱给 `MAILCLAW_LIVE_IMAP_ADDRESS` 发一封新邮件，确认会新建 room
- 对同一线程回复一封 reply，确认会续原 room
- 检查 ACK/final 在真实邮箱线程里显示正确
- 检查不需要手工改 `Message-ID / In-Reply-To / References`

## T24: Live Gmail

需要这些环境变量：

- `MAILCLAW_LIVE_GMAIL_ACCESS_TOKEN`
- `MAILCLAW_LIVE_GMAIL_TOPIC_NAME`
- `MAILCLAW_LIVE_GMAIL_FROM`
- `MAILCLAW_LIVE_GMAIL_TO`

可选：

- `MAILCLAW_LIVE_GMAIL_USER_ID`
- `MAILCLAW_LIVE_GMAIL_LABEL_IDS`

自动断言：

- 能走真实 Gmail recovery/watch plumbing
- 能拿到 recovery metadata
- 能从 recovery 结果里拉取真实 Gmail message 并映射成 envelope
- 能把一封真实 reply 通过 Gmail API 发回去，并把 provider `threadId` 带进 send path

人工补充检查：

- 准备一个受控 seed thread，让 recovery 至少能看到一封可回复的历史消息
- 从真实 Gmail 账号发一封新邮件，确认非 reply 不会因为相同 subject 误续旧 room
- 对同一线程发 reply，确认 Gmail conversation 正确续上
- 检查外发到 Gmail 时 `In-Reply-To / References / Message-ID / threadId` 展示正常
- 检查 Gmail UI 没有因为重复单实例头而丢信
