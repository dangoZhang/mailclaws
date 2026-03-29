# 核心概念

理解 MailClaw，其实只要抓住几个核心概念。

## 1. Room

Room 是一段外部邮件会话的 durable truth boundary。

Room 里会放：

- 当前外部线程状态
- 参与者
- 附件和提取出来的证据
- 审批与投递状态
- 可 replay 的时间线
- 最新 durable Pre

为什么重要：

- 邮件 continuity 不应该依赖一条越来越长的 chat transcript
- 新回复到达时，旧任务可以被安全地判 stale
- 运营和排障需要一个统一真相源

## 2. Virtual Mail

内部 agent 协作通过 virtual mailbox 和 work thread 完成。

它的约束很重要：

- reply 是 single-parent
- 可以 fan-out 给多个 worker
- fan-in 由 reducer 负责
- mailbox 可见性可以按角色控制
- 内部协作可观察，但不污染外部线程

## 3. Pre-First Memory

MailClaw 不把长期记忆建立在原始推理轨迹上。

它的做法是：

- agents 在 scratch 里临时工作
- 把真正值得留下来的结果压成 Pre
- 下一轮默认只加载 latest inbound、latest Pre 和必要 refs

Pre 里通常会有：

- summary
- facts
- open questions
- decisions
- commitments

## 4. ReAct-Pre

MailClaw 的行为模型可以概括成：

1. 在 scratch 里 React
2. 把结果压成 Pre
3. 再把 Pre 展示成外部邮件、内部邮件、审批项或 workbench 视图

因此：

- chain-of-thought 不是长期记忆
- child transcript 不是业务真相
- 邮件正文不是唯一状态本体

## 5. Approval 与 Outbox

MailClaw 把副作用和推理解耦。

典型链路：

1. draft
2. review / guard
3. approval
4. outbox intent
5. delivery attempt

这样做的意义是：

- worker 不能直接对外发信
- 不安全或过期的草稿不会静默流出
- 审计、trace 和 replay 都有统一入口

## 6. Workbench

Mail 标签是这些概念的用户界面。

主要视图：

- `Mail`
- `Accounts`
- `Rooms`
- `Mailboxes`
- `Approvals`

它不是普通聊天记录查看器，而是把 MailClaw 的运行时模型直接展示出来。

## 一句话

MailClaw 把邮件变成 durable room，把多智能体协作变成 virtual mail，把长期记忆收敛成 Pre。
