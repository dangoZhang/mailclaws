# 核心概念

理解 MailClaws，其实只要抓住几个核心概念。

## 1. 房间（Room）

房间是一段外部邮件会话的持久真相边界。

Room 里会放：

- 当前外部线程状态
- 参与者
- 附件和提取出来的证据
- 审批与投递状态
- 可回放的时间线
- 最新预摘要

为什么重要：

- 邮件连续性不应该依赖一条越来越长的聊天上下文
- 新回复到达时，旧任务可以被安全地判为过期
- 运营和排障需要一个统一真相源

## 2. 虚拟邮件（Virtual Mail）

内部智能体协作通过虚拟邮箱和协作线程完成。

它的约束很重要：

- 回复遵循单父结构
- 可以把任务分发给多个工作智能体
- 汇总由汇总器负责
- 邮箱可见性可以按角色控制
- 内部协作可观察，但不污染外部线程

## 3. 预摘要优先记忆（Pre-First Memory）

MailClaws 不把长期记忆建立在原始推理轨迹上。

它的做法是：

- 智能体在临时工作区里处理任务
- 把真正值得留下来的结果压成预摘要
- 下一轮默认只加载最新来信、最新预摘要和必要引用

预摘要里通常会有：

- 摘要
- 事实
- 待解问题
- 决策
- 承诺

## 4. 先反应、后沉淀（ReAct-Pre）

MailClaws 的行为模型可以概括成：

1. 在临时工作区里完成推理和行动
2. 把结果压成预摘要
3. 再把预摘要展示成外部邮件、内部邮件、审批项或工作台视图

因此：

- 思维链不是长期记忆
- 子智能体转录不是业务真相
- 邮件正文不是唯一状态本体

## 5. 审批与发件箱（Approval / Outbox）

MailClaws 把副作用和推理解耦。

典型链路：

1. 草稿
2. 审阅 / 守卫检查
3. 审批
4. 发件箱意图
5. 投递尝试

这样做的意义是：

- 工作智能体不能直接对外发信
- 不安全或过期的草稿不会静默流出
- 审计、追踪和回放都有统一入口

## 6. 邮件工作台（Mail Workbench）

Mail 标签是这些概念的用户界面。

主要视图：

- `Mail`
- `Accounts`
- `Rooms`
- `Mailboxes`
- `Approvals`

它不是普通聊天记录查看器，而是把 MailClaws 的运行时模型直接展示出来。

## 7. 常驻智能体（Durable Agent）

MailClaws 里的长期智能体不是匿名工作进程。

每个常驻智能体都有自己的：

- `SOUL.md`
- `AGENTS.md`
- 公开邮箱
- 内部角色邮箱

`SOUL.md` 里会写清：

- 这个智能体对外和对内的虚拟邮件地址
- 它负责什么
- 遇到什么情况该找谁协作

这让多智能体分工不是靠 prompt 里临时硬塞，而是有稳定的人格入口和协作目录。

## 8. 模板与编制建议（HeadCount）

MailClaws 支持三种补充智能体编组的方式：

- 预设模板
- 自定义常驻智能体
- 从长期子智能体使用模式中总结编制建议

模板适合一键起步，编制建议适合在积压工作变大后决定哪些角色值得长期化。

MailClaws 当前内置了两类最直接的编组模板：

- `One-Person Company`
- `Three Provinces, Six Departments`

模板代码在这里：

- <https://github.com/dangoZhang/mailclaws/blob/main/src/agents/templates.ts>

其中 `One-Person Company` 的组织思路参考了这个 GitHub 项目：

- <https://github.com/cyfyifanchen/one-person-company>

这里复用的是经营方式，而不是直接复用 soul 文件。上游项目更像一人公司方法论，MailClaws 把它收敛成一个前台负责收件、后台负责分工的常驻模板。

`Three Provinces, Six Departments` 则是 MailClaws 内置的一等模板，用来表达更强的分工、审阅和治理结构；如果你已经在 OpenClaw 体系里用过这一套，也可以直接参考这个 GitHub 项目迁移：

- <https://github.com/cft0808/edict>

这一套模板会尽量对齐 `Taizi / Zhongshu / Menxia / Shangshu / 六部` 的角色边界，生成的 `SOUL.md` 里也会留下上游对齐说明和角色契约。

## 一句话

MailClaws 把邮件变成持久房间，把多智能体协作变成虚拟邮件，把长期记忆收敛成预摘要。
