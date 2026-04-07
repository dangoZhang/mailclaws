# MailClaws

<p align="center">
  多智能体邮件。房间清晰。协作可见。上下文更轻。
</p>

<p align="center">
  <a href="./README.md">English</a> ·
  <a href="./README.zh-CN.md"><strong>简体中文</strong></a> ·
  <a href="./README.fr.md">Français</a>
</p>

<p align="center">
  <a href="https://dangozhang.github.io/mailclaws/">网站</a> ·
  <a href="https://github.com/dangoZhang/mailclaws/actions/workflows/ci.yml">CI</a> ·
  <a href="https://github.com/dangoZhang/mailclaws/actions/workflows/release.yml">Release</a>
</p>

<p align="center">
  <img src="./docs/public/mailclaws-poster.svg" alt="MailClaws 宣传图：一个公开邮箱驱动多个内部智能体协作，所有房间、内部邮件与外发治理都在同一个 Mail 工作台里可见。" width="960" />
</p>

MailClaws 把邮件变成真正的多智能体运行时。

一条线程，就是一个房间。  
一个前台智能体，可以带起多个专门智能体。  
每一次接力，都看得见。  
每一次回复，都能追。  
每一次外发，都有闸门。

它特别适合共享邮箱、长线程、频繁切换、以及需要先汇报进度再给最终答案的工作。

## 为什么它一眼就不一样

很多工具把协作藏起来。MailClaws 把协作摊开来。

你能看到房间。  
你能看到内部邮件。  
你能看到审阅链。  
你能看到哪里被拦下，哪里被通过，哪里真正发出去了。

它不像一个巨大的黑盒 run。  
它更像一个真的在收件、分工、回信的团队。

## 最有杀伤力的优势

MailClaws 更轻。不是口号。是结构决定的。

它不会每一轮都重放整段历史。它只带着真正该留下来的预摘要继续往前走。基准测试里，长线程后续回复的估算 prompt 体积从 **2006** 降到 **755**，第 6 轮后续回复从 **2868** 降到 **752**，5 个工作智能体汇总回主智能体的场景从 **3444** 降到 **750**。

这不只是省钱。  
这让多房间切换更轻。  
这让长任务汇报更稳。  
这让多智能体协作不再把主智能体拖垮。

## 为什么邮件天然适合

邮件本来就有对的形状。

- 上下文边界清楚
- 历史天然可追溯
- 线程天然可共享
- 单条消息字数合适
- 完全符合工作习惯
- 不需要额外配置新协议

用户早就会在线程里工作。MailClaws 直接从这里开始。

## 你实际会得到什么

- 一个公开智能体可以守住前台邮箱，多个专门智能体在背后协作。
- 内部协作不是隐藏 run，而是虚拟邮箱、协作线程和可回看的内部邮件。
- ACK、进度汇报、审阅、审批、最终外发，全都挂在同一个房间上。
- Workbench 里能看到谁收到了什么、谁回了什么、哪版草稿胜出、哪里被拦下。
- 短期 subagent 只负责计算，不偷走长期人格；常驻智能体才拥有自己的 `SOUL.md`、邮箱和记忆边界。

## 三分钟跑通，让智能体发给你第一封邮件

```bash
./install.sh
MAILCLAW_FEATURE_MAIL_INGEST=true mailclaws
```

再开一个终端：

```bash
mailclaws onboard you@example.com
mailclaws login
mailclaws dashboard
```

然后这样体验：

1. 登录任意一个你已经在用的邮箱。
2. 用另一个邮箱给它发一封测试邮件。
3. 打开工作台，点击 `Mail`。
4. 看这条房间出现、内部协作发生、回复链逐步形成。
5. 让智能体通过受治理的外发链路，给你发来第一封真正的回信。

如果你想先看一个安全的本地演示，运行 `pnpm demo:mail`，然后打开 `http://127.0.0.1:3020/workbench/mail`。

## 快速上手模板

模板存在的目的只有一个：更快开工。

- `One-Person Company`：前台收件，后台分工，适合一人团队或很轻的前后台协作形态。它参考了 <https://github.com/cyfyifanchen/one-person-company> 的经营方式，但在 MailClaws 里被落成了真正的常驻角色编制。
- `Three Provinces, Six Departments`：更强的审阅、治理和执行编制，角色结构对齐 <https://github.com/cft0808/edict>。

模板实现代码在这里：

- <https://github.com/dangoZhang/mailclaws/blob/main/src/agents/templates.ts>

应用大编制模板时，生成出来的 `SOUL.md` 会带上上游对齐说明和角色契约，避免只剩名字像、行为却越来越散。

## 网站与工作台

- 网站：<https://dangozhang.github.io/mailclaws/>
- 工作台：运行 `mailclaws dashboard`，登录后点击 `Mail`

网站负责解释模型。  
工作台负责把系统真相直接展示给你。

## 许可

MIT。见 [LICENSE](./LICENSE)。
