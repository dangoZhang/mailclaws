# 邮件工作台

邮件工作台是 MailClaws 面向用户的主界面。

在推荐形态里，它会作为 OpenClaw/Gateway 里的 `Mail` 标签页出现。`/workbench/mail` 只是直达兜底和 deep link 入口。

## 打开方式

推荐：

```bash
mailclaws dashboard
```

然后登录 OpenClaw/Gateway，点击 `Mail`。

兜底：

```bash
mailclaws open
```

## 每个标签页代表什么

### Mail

入口页。

适合：

- 第一次连接邮箱
- 先看推荐登录路径
- 一键应用智能体模板
- 创建自定义常驻智能体
- 查看当前智能体目录和编制建议
- 从最短路径重新进入 Mail 标签

### Accounts

账号视图。

适合：

- 确认邮箱是否已经连接
- 查看邮箱服务状态和总体健康度
- 跳进该账号下的房间或协作邮箱视图

### Rooms

房间视图。

适合：

- 以持久状态的方式查看会话
- 检查版本、参与者、审批和时间线
- 追踪为什么最新回复会长成现在这样
- 在一个房间里直接看清虚拟邮件、邮箱投递和受治理发件箱

### Mailboxes

内部协作视图。

适合：

- 查看某个公开或内部协作邮箱
- 理解某个智能体角色实际看到了什么
- 在不先读完整房间时间线的情况下检查内部协作

### Approvals

审批视图。

适合：

- 查看待处理的外发审批
- 在真实外发前检查治理链路

## 一个典型用户路径

最常见的是：

1. 打开 `Accounts`
2. 选中已连接账号
3. 打开新房间
4. 如有需要，跳到某个协作邮箱参与者
5. 如有需要，打开 `Approvals`

这和 MailClaws 的运行时模型是一致的：

- 账号给你邮箱服务和邮箱范围
- 房间给你持久真相
- 协作邮箱给你协作细节
- 审批给你副作用控制

## 在一个房间里看多智能体协作

打开房间后，按这个顺序看：

1. `房间摘要`
2. `虚拟邮件`
3. `邮箱投递`
4. `受治理发件箱`
5. `网关映射`

这能帮助你快速看清：

- 哪些内部角色参与了协作
- 哪条任务或回复被投递到哪个协作邮箱
- 哪些投递已完成，哪些已经过期
- 哪个内部结果真正进入了外发候选

如果你还想看某个角色自己的视角，再点击房间里的协作邮箱标签。

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

邮件工作台不是普通聊天历史查看器。

它要展示的是：

- 已连接账号
- 持久房间
- 内部 / 公开协作邮箱
- 审批状态

也就是 MailClaws 运行时真正关心的那套对象。

## 延伸阅读

- [核心概念](./concepts.zh-CN.md)
- [多智能体协作](./multi-agent-workflows.zh-CN.md)
- [快速开始](./getting-started.zh-CN.md)
- [集成](./integrations.zh-CN.md)
