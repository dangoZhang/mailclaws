# 快速开始

这一页只讲最短路径：从零开始，到收一封真实邮件并在 MailClaw 里看到它。

如果你已经知道 MailClaw 是什么，可以直接跳到 [先跑通第一封真实邮件](#three-minute-first-mail)。

## 你需要准备什么

- Node.js 22+
- 一个你想接入的邮箱
- 另一个邮箱或邮件客户端，用来发测试邮件

MailClaw 不绑定单一 provider。当前内建支持 Gmail、Outlook、QQ、iCloud、Yahoo、163/126，以及通用 IMAP/SMTP。

## 安装

推荐：

```bash
./install.sh
```

其他方式：

```bash
npm install -g mailclaw
pnpm setup && pnpm add -g mailclaw
brew install mailclaw
```

如果你从源码运行：

```bash
pnpm install
```

## 启动 MailClaw

```bash
MAILCLAW_FEATURE_MAIL_INGEST=true \
mailclaw
```

这会启动本地 runtime 和 Mail 标签页后端。

## 接入一个邮箱

推荐路径：

```bash
mailclaw onboard you@example.com
mailclaw login
```

含义：

- `mailclaw onboard` 会根据邮箱地址推荐最合适的 provider 路径
- `mailclaw login` 会带你完成实际登录流程

如果你想先看支持哪些 provider：

```bash
mailclaw providers
```

## 打开 Mail 标签页

推荐入口：

```bash
mailclaw dashboard
```

然后登录 OpenClaw/Gateway，点击 `Mail`。

直达兜底入口：

```bash
mailclaw open
```

或者直接打开：

```text
http://127.0.0.1:3000/workbench/mail
```

<a id="three-minute-first-mail"></a>

## 先跑通第一封真实邮件 {#three-minute-first-mail}

1. 用 `mailclaw login` 接入一个邮箱。
2. 从 Mail 标签页或 `mailclaw accounts` 找到已连接地址。
3. 用另一个邮箱给它发一封邮件。
4. 打开 Mail 标签页。
5. 进入对应账号，再打开新 room。

这就是 MailClaw 最核心的闭环：

- 真实邮件进入
- MailClaw 创建或续接 room
- agents 在 room 里工作
- 你从 Mail 标签页里查看结果

## 你会看到什么

第一封邮件进来后，Mail 标签页里最有用的是这几个视图：

- `Accounts`：哪些邮箱已连接、是否健康
- `Rooms`：durable conversation state
- `Mailboxes`：内部或公开 mailbox 的协作视图
- `Approvals`：待审批的外发工作

如果你想看内部多智能体协作：

- 打开一个 room
- 先看 `Virtual Mail`、`Mailbox Deliveries`、`Governed Outbox`
- 如果需要某个角色的局部视角，再点击对应 mailbox participant
- 查看 mailbox feed 和 room-local collaboration

## 对 OpenClaw 用户

如果你本来就在用 OpenClaw，推荐路径不变：

1. 启动 MailClaw
2. 运行 `mailclaw dashboard`
3. 进入宿主控制台
4. 点击 `Mail`

MailClaw 设计目标就是作为 OpenClaw shell 里的一个 Mail 标签，而不是一套完全独立的新工作台。

## 下一步

- [核心概念](./concepts.zh-CN.md)
- [多智能体协作](./multi-agent-workflows.zh-CN.md)
- [Mail Workbench](./operator-console.zh-CN.md)
- [集成](./integrations.zh-CN.md)
