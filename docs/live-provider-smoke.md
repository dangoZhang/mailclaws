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

支持两种配置方式。

方式 A：通用 IMAP/SMTP 环境变量

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

可选：

- `MAILCLAW_LIVE_IMAP_CHECKPOINT`
- `MAILCLAW_LIVE_IMAP_ECHO_TEXT`
- `MAILCLAW_LIVE_IMAP_EXPECTED_FROM`

方式 B：预置邮箱最小环境变量

支持这些前缀：

- `MAILCLAW_LIVE_QQ_*`
- `MAILCLAW_LIVE_163_*`
- `MAILCLAW_LIVE_126_*`
- `MAILCLAW_LIVE_ICLOUD_*`
- `MAILCLAW_LIVE_YAHOO_*`

每个前缀最少都需要两项：

- `<PREFIX>_ADDRESS`
- `<PREFIX>_AUTH_CODE`

也兼容：

- `<PREFIX>_PASSWORD`

以 QQ 为例：

- `MAILCLAW_LIVE_QQ_ADDRESS`
- `MAILCLAW_LIVE_QQ_AUTH_CODE`

可选：

- `MAILCLAW_LIVE_QQ_PASSWORD`
- `MAILCLAW_LIVE_QQ_IMAP_MAILBOX`
- `MAILCLAW_LIVE_QQ_IMAP_CHECKPOINT`
- `MAILCLAW_LIVE_QQ_ECHO_TEXT`
- `MAILCLAW_LIVE_QQ_EXPECTED_FROM`
- `MAILCLAW_LIVE_QQ_IMAP_HOST / PORT / SECURE / USERNAME`
- `MAILCLAW_LIVE_QQ_SMTP_HOST / PORT / SECURE / USERNAME / PASSWORD / FROM`

如果只给 `MAILCLAW_LIVE_QQ_ADDRESS` 和 `MAILCLAW_LIVE_QQ_AUTH_CODE`，测试会自动套用：

- IMAP: `imap.qq.com:993`, `secure=true`, mailbox=`INBOX`
- SMTP: `smtp.qq.com:465`, `secure=true`

其它预置邮箱的默认值：

| 前缀 | IMAP 默认 | SMTP 默认 | 备注 |
| --- | --- | --- | --- |
| `MAILCLAW_LIVE_QQ_*` | `imap.qq.com:993`, `secure=true` | `smtp.qq.com:465`, `secure=true` | 使用 QQ 授权码 |
| `MAILCLAW_LIVE_163_*` | `imap.163.com:993`, `secure=true` | `smtp.163.com:465`, `secure=true` | 使用 163 授权码 |
| `MAILCLAW_LIVE_126_*` | `imap.126.com:993`, `secure=true` | `smtp.126.com:465`, `secure=true` | 使用 126 授权码 |
| `MAILCLAW_LIVE_ICLOUD_*` | `imap.mail.me.com:993`, `secure=true` | `smtp.mail.me.com:587`, `secure=false` | 使用 Apple app-specific password |
| `MAILCLAW_LIVE_YAHOO_*` | `imap.mail.yahoo.com:993`, `secure=true` | `smtp.mail.yahoo.com:465`, `secure=true` | 使用 Yahoo app password |

自动断言：

- 能连上真实 IMAP 并返回合法 batch
- 能得到 durable `uidValidity`
- 能找到一封真实入站邮件，正文精确等于 `hello world` 或你配置的 `*_ECHO_TEXT`
- 能把这封真实邮件喂进 runtime，并生成 final outbox
- final reply 的正文会回显为同样的 `hello world`
- 能通过真实 SMTP 把 final reply 发回原始发件人
- reply 会带上 `In-Reply-To / References`

人工补充检查：

- 先给 `MAILCLAW_LIVE_IMAP_ADDRESS` 或 `MAILCLAW_LIVE_QQ_ADDRESS` 发一封新邮件，正文只写 `hello world`
- 最好在发信前记录或设置 `MAILCLAW_LIVE_IMAP_CHECKPOINT` / `MAILCLAW_LIVE_QQ_IMAP_CHECKPOINT`，避免测试扫到旧邮件
- 如果同一收件箱里有多封 `hello world`，用 `*_EXPECTED_FROM` 限定发件人
- 这里填的是 provider 发放的授权码、app password 或专用密码，不是网页登录密码
- 发信后再执行 `pnpm test:live-providers`

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
