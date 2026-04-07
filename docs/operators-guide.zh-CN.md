# 运维指南

这一页面向需要日常维护 MailClaws 的人。

重点不是讲邮箱客户端怎么用，而是讲当用户说下面这些话时该怎么查：

- “我发了邮件，系统收到了吗？”
- “为什么这个 room 没有回复？”
- “为什么外发还卡着？”

## 先看哪几个对象

MailClaws 的运维最好沿着它自己的模型排查：

- `account`：一个已连接邮箱及其 provider 状态
- `room`：一段会话的 durable truth boundary
- `mailbox`：内部或公开协作视图
- `approval`：受治理的外部副作用

## 一线排查顺序

当用户说“我发了邮件，到底发生了什么”时，按下面顺序查。

### 1. Account

先确认邮箱账号存在且健康。

常用命令：

```bash
mailclaws accounts
mailclaws accounts show <accountId>
```

常用 API：

- `GET /api/accounts/:accountId/provider-state`

### 2. Room

再确认 MailClaws 是否创建或续接了 room。

常用命令：

```bash
mailclaws rooms
mailclaws replay <roomKey>
```

### 3. Mailbox

如果 room 已存在，但行为还是看不清，就检查 mailbox 或 inbox 视图。

常用命令：

```bash
mailclaws inboxes <accountId>
mailctl observe mailbox-feed <accountId> <mailboxId>
mailctl observe mailbox-view <roomKey> <mailboxId>
```

### 4. Approval

如果系统似乎准备好了回复但没有真正发出去，就看审批状态。

常用命令：

```bash
mailctl observe approvals room <roomKey>
mailctl operate deliver-outbox
```

## Workbench 排查路径

浏览器里的 Mail Workbench 对应同一条顺序：

1. 打开 `Accounts`
2. 进入邮箱账号
3. 打开对应 room
4. 如有必要，跳进某个 mailbox
5. 如有必要，打开 `Approvals`

常用深链：

- `/workbench/mail?mode=accounts`
- `/workbench/mail?mode=rooms`
- `/workbench/mail?mode=mailboxes`
- `/workbench/mail?mode=approvals&approvalStatus=requested`
- `/workbench/mail/accounts/:accountId`
- `/workbench/mail/rooms/:roomKey`
- `/workbench/mail/mailboxes/:accountId/:mailboxId`

## 常见情况

### 发了邮件，但没有 room

先检查：

- 账号和 provider 是否正常
- 入站配置是否正确
- 这封邮件到底有没有到达 MailClaws

从这里开始：

```bash
mailclaws accounts show <accountId>
mailclaws rooms
```

### room 已经有了，但没有回复

先检查：

- room replay
- internal mailbox activity
- approval state

从这里开始：

```bash
mailclaws replay <roomKey>
mailctl observe mailbox-view <roomKey> <mailboxId>
mailctl observe approvals room <roomKey>
```

### 外发看起来卡住了

先检查：

- 是否还在等待审批
- 是否已经尝试投递
- 当前 provider 路径是否健康

从这里开始：

```bash
mailctl operate deliver-outbox
mailctl observe approvals room <roomKey>
```

## 常用 API

room 和 mailbox 检查：

- `GET /api/rooms/:roomKey/replay`
- `GET /api/rooms/:roomKey/approvals`
- `GET /api/rooms/:roomKey/mailboxes/:mailboxId`
- `GET /api/accounts/:accountId/inboxes`
- `GET /api/accounts/:accountId/mailbox-console`
- `GET /api/accounts/:accountId/mailboxes/:mailboxId/feed`

console read model：

- `GET /api/console/workbench`
- `GET /api/console/accounts`
- `GET /api/console/rooms`
- `GET /api/console/approvals`

投递和恢复：

- `POST /api/outbox/:outboxId/approve`
- `POST /api/outbox/:outboxId/reject`
- `POST /api/outbox/deliver`
- `POST /api/recovery/room-queue`

## 一个实用规则

如果你不确定从哪开始，就按这个顺序：

1. account
2. room
3. mailbox
4. approval

这和 MailClaws 自己的结构一致，通常比直接扎进底层执行痕迹更快定位问题。
