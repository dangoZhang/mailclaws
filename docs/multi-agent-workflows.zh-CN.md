# 多智能体协作

MailClaw 不让多个 agent 共享一锅越来越长的 transcript。

它把协作变成可检查、可回放、可治理的“邮件形对象”：

- room 承载一条外部会话的 durable truth
- virtual mailbox 把公开人格和内部 worker 角色分开
- work thread 把并行任务隔离开
- reducer 负责把多个 worker 结果收敛回 room
- approval 和 outbox intent 仍然是唯一真实外发路径

## 实际协作模型

当一封真实邮件到达时：

1. MailClaw 打开或更新一个 room。
2. front orchestrator 读取最新 inbound 和最新的 durable Pre。
3. 如果需要更多工作，就向内部 mailbox 发送 task mail。
4. worker 通过 single-parent internal reply 回复。
5. reducer 或 orchestrator 收敛结果。
6. 只有在这之后，系统才可能创建 approval 或 governed outbox intent。

这意味着：

- 内部协作是 durable 的、可 replay 的
- stale worker result 可以被丢弃而不会污染 room 真相
- 即使多个 worker 参与，外部邮件线程仍然保持干净

## 在 Workbench 里看什么

打开 Mail 标签后：

1. 进入 `Rooms`
2. 打开一个 room
3. 按下面顺序查看

### Room Summary

这里先确认：

- 这个 room 属于哪个 account
- 当前 front agent 身份是谁
- 哪些 collaborator agent 或 summoned role 参与了本轮工作

### Virtual Mail

这里直接看：

- 哪个 mailbox 发出了内部消息
- 发给了哪个角色
- 这条消息是 root work 还是 reply
- 这条消息来自 provider mail、gateway chat 还是 internal virtual mail

这是观察多智能体协作最直接的视图。

### Mailbox Deliveries

这里看：

- 每条 internal message 被投递到了哪个 mailbox
- 它当前是 leased、consumed、stale、vetoed 还是 superseded

它反映的是协作在运行层面是否真正完成，而不只是逻辑上“看起来发过了”。

### Governed Outbox

这里看：

- 哪个内部结果变成了外部发信候选
- 当前是 pending approval、queued、sent 还是 failed

这是内部 agent 工作与真实外部副作用之间的边界。

### Gateway Projection

当 room 和 OpenClaw/Gateway 绑定时，查看这里：

- 哪些 gateway session key 绑定到了 room
- 哪些 room outcome 被投影回 Gateway
- dispatch 是 pending、dispatched 还是 failed

## Mailbox 视图

如果你想从某个角色自己的视角看：

1. 打开 `Mailboxes`
2. 选择一个 mailbox
3. 重点看：
   - `Mailbox Feed`
   - `Room Thread In Mailbox`

这适合回答这些问题：

- reviewer 实际看到了什么？
- researcher mailbox 收到了哪些任务？
- guard mailbox 是否真的收到这版 draft？

## 常见协作模式

### 简单直接回复

- 一个 room
- 一次 orchestrator 决策
- 一个 governed outbox intent

重点看 `Room Summary`、`Governed Outbox` 和 `Timeline`。

### 并行 worker 协作

- orchestrator 发出多个 task mail
- worker 在各自 work thread 中回答
- reducer 负责收敛

重点看 `Virtual Mail` 和 `Mailbox Deliveries`。

### 审批闸门回复

- drafter 或 orchestrator 先提出候选回复
- reviewer 或 guard 阻断、要求修改或升级审批
- approval 成为最终放行闸门

重点看 `Approvals` 和 room 内的 `Governed Outbox`。

## 对应 CLI

如果你想在命令行看同样的信息：

```bash
mailclaw rooms
mailclaw replay <roomKey>
mailctl mailbox view <roomKey> <mailboxId>
mailctl mailbox feed <accountId> <mailboxId>
mailclaw approvals room <roomKey>
mailclaw trace <roomKey>
```

## MailClaw 故意避免的东西

MailClaw 不依赖这些模式：

- 把所有 agent 都绑在一段共享 transcript 上
- 用 subject 猜 continuity 作为内部协作真相
- 让 worker 直接外发
- 把 scratch trace 当成长期记忆

系统的目标不只是“让 agent 能合作”。
真正目标是：让协作本身 durable、可见、可治理。
