# 集成指南

这一页说明 MailClaws 怎么和外部系统连接。

MailClaws 的定位不是替代邮箱 provider，而是站在真实邮件系统之上，提供 room、virtual mail、Pre 和记治理后的外发。

## 集成模型

MailClaws 把职责拆开：

- provider 负责收发邮件
- room 负责 durable truth
- virtual mail 负责内部协作
- approval 和 outbox 负责治理外部副作用
- Mail 标签页负责把这套模型展示给用户和运营

因此，MailClaws 可以接入现有邮箱系统，但不会把任何一个 provider 当成业务真相源。

## 当前支持哪些邮箱接入路径

MailClaws 现在主要支持三类实用接入方式。

完整邮箱矩阵和用户操作，见 [邮箱接入清单](./mailbox-providers.zh-CN.md)。

### 1. OAuth 邮箱

优先推荐。

当前支持：

- Gmail
- Outlook / Microsoft 365

适合原因：

- 接入阻力最低
- 更适合普通用户
- 与 provider 原生 watch / send 的配合更自然

### 2. IMAP / SMTP 邮箱

适合 OAuth 不可用或不方便时。

常见预设包括：

- QQ
- iCloud
- Yahoo
- 163 / 126
- 通用 IMAP / SMTP

适合原因：

- 可以覆盖很多传统邮箱
- 适合沿用已有账号密码体系

### 3. 转发 / Raw MIME 入站

适合 provider 原生集成暂时做不到时。

适合原因：

- 便于渐进迁移
- 可以先让 MailClaws 收到真实邮件
- 后续再切到 provider-native 路径

## 普通用户应该怎么选

如果你只知道邮箱地址，不知道走哪条路：

```bash
mailclaws onboard you@example.com
mailclaws login
```

如果你想先看支持哪些 provider：

```bash
mailclaws providers
```

总建议顺序：

1. 能用 Gmail / Outlook OAuth 就先用它
2. 不能用 OAuth 时走 IMAP / SMTP
3. 实在不行再用 forward / raw MIME

## 和 OpenClaw / Gateway 的关系

MailClaws 的目标是适配 OpenClaw 风格工作流。

推荐方式：

1. 先启动 MailClaws
2. 运行 `mailclaws dashboard`
3. 登录 OpenClaw/Gateway
4. 点击 `Mail`

在这套路径里：

- OpenClaw/Gateway 仍然是宿主 shell
- MailClaws 提供 Mail 标签页和 email-native runtime
- `mailclaws open` 与 `/workbench/mail` 保留为直达兜底入口

## 入站方式

MailClaws 可以通过这些方式接收入站邮件：

- provider-native watcher / fetcher
- 规范化 API 入站
- raw MIME 入站
- Gateway 事件投影

典型入口：

- Gmail watch/history
- IMAP fetch / polling
- `POST /api/inbound`
- `POST /api/inbound/raw`
- `POST /api/gateway/events`

## 外发方式

MailClaws 可以通过这些方式完成外发：

- Gmail API send
- SMTP
- 受治理的 outbox 投递

核心规则不变：

真实外发必须经过 approval 和 outbox，不能由 worker 直接触发。

## OAuth 与账号配置

常用命令：

```bash
mailclaws providers
mailclaws login
mailctl connect providers [provider]
mailctl connect login gmail <accountId> [displayName]
mailctl connect login outlook <accountId> [displayName]
```

常用 API：

- `GET /api/connect`
- `GET /api/connect/providers`
- `GET /api/connect/providers/:provider`
- `POST /api/accounts`
- `GET /api/auth/:provider/start`
- `POST /api/auth/:provider/start`

## 接下来读什么

- [快速开始](./getting-started.zh-CN.md)
- [核心概念](./concepts.zh-CN.md)
- [Mail Workbench](./operator-console.zh-CN.md)
- [运维指南](./operators-guide.zh-CN.md)
