# Mail Workbench

Mail Workbench 是 MailClaw 面向用户的主界面。

在推荐形态里，它会作为 OpenClaw/Gateway 里的 `Mail` 标签页出现。`/workbench/mail` 只是直达兜底和 deep link 入口。

## 打开方式

推荐：

```bash
mailclaw dashboard
```

然后登录 OpenClaw/Gateway，点击 `Mail`。

兜底：

```bash
mailclaw open
```

## 每个标签页代表什么

### Mail

入口页。

适合：

- 第一次连接邮箱
- 先看推荐 provider 路径
- 从最短路径重新进入 Mail 标签

### Accounts

账号视图。

适合：

- 确认邮箱是否已经连接
- 查看 provider 状态和总体健康度
- 跳进该账号下的 room 或 mailbox 视图

### Rooms

Room 视图。

适合：

- 以 durable state 的方式查看会话
- 检查 revision、参与者、审批和 timeline
- 追踪为什么最新回复会长成现在这样
- 在一个 room 里直接看清 virtual mail、mailbox delivery 和 governed outbox

### Mailboxes

内部协作视图。

适合：

- 查看某个 public 或 internal mailbox
- 理解某个 agent role 实际看到了什么
- 在不先读完整 room timeline 的情况下检查内部协作

### Approvals

审批视图。

适合：

- 查看待处理的外发审批
- 在真实外发前检查治理链路

## 一个典型用户路径

最常见的是：

1. 打开 `Accounts`
2. 选中已连接账号
3. 打开新 room
4. 如有需要，跳到某个 mailbox participant
5. 如有需要，打开 `Approvals`

这和 MailClaw 的运行时模型是一致的：

- account 给你 provider 和 mailbox 范围
- room 给你 durable truth
- mailbox 给你协作细节
- approvals 给你副作用控制

## 在一个 Room 里看多智能体协作

打开 room 后，按这个顺序看：

1. `Room Summary`
2. `Virtual Mail`
3. `Mailbox Deliveries`
4. `Governed Outbox`
5. `Gateway Projection`

这能帮助你快速看清：

- 哪些内部角色参与了协作
- 哪条任务或回复被投递到哪个 mailbox
- 哪些 delivery 被 consumed，哪些已经 stale
- 哪个内部结果真正进入了外发候选

如果你还想看某个角色自己的视角，再点击 room 里的 mailbox chip。

## 常用深链

- `/workbench/mail`
- `/workbench/mail?mode=accounts`
- `/workbench/mail?mode=rooms`
- `/workbench/mail?mode=mailboxes`
- `/workbench/mail?mode=approvals&approvalStatus=requested`
- `/workbench/mail/accounts/:accountId`
- `/workbench/mail/rooms/:roomKey`
- `/workbench/mail/mailboxes/:accountId/:mailboxId`

这些路径的目标是让你无论从 Gateway 进入还是从直达页进入，都能稳定落到同一视图。

## 这套界面的定位

Mail Workbench 不是普通聊天历史查看器。

它要展示的是：

- connected accounts
- durable rooms
- internal/public mailboxes
- approval state

也就是 MailClaw 运行时真正关心的那套对象。

## 延伸阅读

- [核心概念](./concepts.zh-CN.md)
- [多智能体协作](./multi-agent-workflows.zh-CN.md)
- [快速开始](./getting-started.zh-CN.md)
- [集成](./integrations.zh-CN.md)
