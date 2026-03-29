# MailClaw

<p align="center">
  面向耐久化、可审计、多智能体协作的邮件原生运行时。
</p>

<p align="center">
  <a href="./README.md">English</a> ·
  <a href="./README.zh-CN.md"><strong>简体中文</strong></a> ·
  <a href="./README.fr.md">Français</a>
</p>

<p align="center">
  <a href="./docs/index.zh-CN.md">文档</a> ·
  <a href="https://github.com/dangoZhang/mailclaw/actions/workflows/ci.yml">CI</a> ·
  <a href="https://github.com/dangoZhang/mailclaw/actions/workflows/release.yml">Release</a>
</p>

MailClaw 把邮件会话变成 durable room，把内部 agent 协作变成 virtual mail，把长期记忆收敛成 Pre，并把 approval、outbox、replay 和 delivery 全部放进同一个运行时里。

MailClaw 不预设某一家邮箱服务。你只需要输入自己已经在用的邮箱地址，让 MailClaw 推荐合适的 provider 路径，再连接这个邮箱即可。内建路径覆盖常见托管邮箱以及通用 IMAP/SMTP。

## 为什么是 MailClaw

- 一条外部邮件会话对应一个 durable room
- agent 之间通过内部邮件协作，而不是共享一锅越来越长的 transcript
- 长期记忆只保留 Pre，不保留临时 scratch 轨迹
- approval、outbox、replay、internal mail 都能在同一套 workbench 中查看
- Mail 可以作为 OpenClaw 风格 Gateway workbench 的一个标签页挂载

## 安装

运行时要求：Node.js 22+。

```bash
./install.sh
```

也支持文档中的一键安装路径：

- npm
- pnpm
- Homebrew

## 首次运行

```bash
pnpm install
MAILCLAW_FEATURE_MAIL_INGEST=true pnpm mailclaw
```

再开一个终端：

```bash
pnpm mailclaw onboard you@example.com
pnpm mailclaw login
pnpm mailclaw dashboard
```

推荐的首次体验路径：

1. 启动 MailClaw。
2. 登录一个你已经在用的邮箱。
3. 用另一个邮箱发一封测试邮件。
4. 在 Gateway 风格 workbench 中打开 `Mail` 标签。
5. 查看 room、内部 agent 邮件和外发状态。

如果你想先看本地演示：

```bash
pnpm demo:mail
```

然后打开 `http://127.0.0.1:3020/workbench/mail`。

## Workbench 里能看到什么

- `Accounts`：已连接邮箱与 provider 状态
- `Rooms`：外部会话形成的 durable room
- `Mailboxes`：public agent 与 internal role 的虚拟邮箱
- `Approvals`：等待审批的外发邮件
- `Mail`：集成在 OpenClaw 风格 shell 中的 Mail 标签

MailClaw 会把内部协作也暴露出来。你可以看到哪个 agent 接了任务、哪个 worker 回了 internal reply、哪个 review 阻断了草稿、哪个结果最终进入了 outbox。

## 多智能体模型

MailClaw 把三件事明确拆开：

- `Room`：一条外部会话的 durable truth
- `Virtual Mail`：agent 之间的内部通信协议
- `Pre`：每一轮工作后留下来的紧凑状态

长期 agent 有自己的 `SOUL.md`、角色邮箱和协作规则。单次 subagent 只是 burst worker。它的结果只有在被归一化成 internal reply mail 并回写 room 后，才能进入业务真相。

## 与 OpenClaw 的关系

MailClaw 不是替代 OpenClaw，而是在它的生态入口之上补齐邮件原生运行时能力：

- room-first truth，而不是 session-first truth
- 邮件线程与 provider ingest
- agent 间 virtual mail
- approval 与 outbox 治理
- 邮件操作的 replay 与 recovery

## 文档

文档是正式产品说明：

- 文档索引：[docs/index.zh-CN.md](./docs/index.zh-CN.md)
- 快速开始：[docs/getting-started.zh-CN.md](./docs/getting-started.zh-CN.md)
- 核心概念：[docs/concepts.zh-CN.md](./docs/concepts.zh-CN.md)
- 多智能体协作：[docs/multi-agent-workflows.zh-CN.md](./docs/multi-agent-workflows.zh-CN.md)
- 控制台：[docs/operator-console.zh-CN.md](./docs/operator-console.zh-CN.md)

仓库里已经加好了 GitHub Pages workflow。一旦这个仓库的套餐或可见性支持 Pages，同一份 docs 源文件就会自动发布成静态站点。

本地启动文档：

```bash
pnpm docs:dev
```

构建静态文档站：

```bash
pnpm docs:build
```

## 当前状态

MailClaw 目前已经具备：

- room kernel 与 replay
- provider onboarding 与邮箱登录
- IMAP、SMTP、Gmail 和 raw RFC822 入站路径
- virtual mailbox 与 internal mail 投影
- approval-gated 外发
- OpenClaw 风格嵌入式 Mail workbench

当前边界与剩余约束见：

- [docs/security-boundaries.zh-CN.md](./docs/security-boundaries.zh-CN.md)

## 许可

MIT。见 [LICENSE](./LICENSE)。
