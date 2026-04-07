# 快速开始

这一页只讲最短路径：从零开始，到收一封真实邮件并在 MailClaws 里看到它。

如果你已经知道 MailClaws 是什么，可以直接跳到 [先跑通第一封真实邮件](#three-minute-first-mail)。

## 你需要准备什么

- Node.js 22+
- 一个你想接入的邮箱
- 另一个邮箱或邮件客户端，用来发测试邮件

MailClaws 不绑定某一家邮箱服务。你只需要登录自己已经在用的邮箱即可。

## 安装

推荐：

```bash
./install.sh
```

其他方式：

```bash
npm install -g mailclaws
pnpm setup && pnpm add -g mailclaws
brew install mailclaws
```

如果你从源码运行：

```bash
pnpm install
```

## 启动 MailClaws

```bash
MAILCLAW_FEATURE_MAIL_INGEST=true \
mailclaws
```

这会启动本地运行时和 `Mail` 标签页后端。

## 接入一个邮箱

推荐路径：

```bash
mailclaws onboard you@example.com
mailclaws login
```

含义：

- `mailclaws onboard` 会根据邮箱地址推荐最合适的登录路径
- `mailclaws login` 会带你完成实际登录流程

## 打开 Mail 标签页

推荐入口：

```bash
mailclaws dashboard
```

然后登录 OpenClaw/Gateway，点击 `Mail`。

直达兜底入口：

```bash
mailclaws open
```

或者直接打开：

```text
http://127.0.0.1:3000/workbench/mail
```

<a id="three-minute-first-mail"></a>

## 先跑通第一封真实邮件 {#three-minute-first-mail}

1. 用 `mailclaws login` 接入一个邮箱。
2. 从 Mail 标签页或 `mailclaws accounts` 找到已连接地址。
3. 用另一个邮箱给它发一封邮件。
4. 打开 Mail 标签页。
5. 进入对应账号，再打开新会话房间。

这就是 MailClaws 最核心的闭环：

- 真实邮件进入
- MailClaws 创建或续接房间
- 智能体在房间里工作
- 你从 Mail 标签页里查看结果

## 你会看到什么

第一封邮件进来后，Mail 标签页里最有用的是这几个视图：

- `Accounts`：哪些邮箱已连接、是否健康
- `Rooms`：每条会话形成的持久状态
- `Mailboxes`：内部或公开协作邮箱的视图
- `Approvals`：待审批的外发工作

如果你想看内部多智能体协作：

- 打开一个房间
- 先看 `虚拟邮件`、`邮箱投递`、`受治理发件箱`
- 如果需要某个角色的局部视角，再点击对应的协作邮箱参与者
- 查看该邮箱里的消息流和房间内协作

## 对 OpenClaw 用户

如果你本来就在用 OpenClaw，推荐路径不变：

1. 启动 MailClaws
2. 运行 `mailclaws dashboard`
3. 进入宿主控制台
4. 点击 `Mail`

MailClaws 的设计目标就是作为 OpenClaw 外壳里的一个 `Mail` 标签，而不是一套完全独立的新工作台。

## 下一步

- [核心概念](./concepts.zh-CN.md)
- [多智能体协作](./multi-agent-workflows.zh-CN.md)
- [邮件工作台](./operator-console.zh-CN.md)
- [集成](./integrations.zh-CN.md)
