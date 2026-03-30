# MailClaws

<p align="center">
  更省上下文、更适合多会话切换、更擅长多智能体协作的邮件运行时。
</p>

<p align="center">
  <a href="./README.md">English</a> ·
  <a href="./README.zh-CN.md"><strong>简体中文</strong></a> ·
  <a href="./README.fr.md">Français</a>
</p>

<p align="center">
  <a href="https://dangozhang.github.io/mailclaw/">网站</a> ·
  <a href="https://github.com/dangoZhang/mailclaw/actions/workflows/ci.yml">CI</a> ·
  <a href="https://github.com/dangoZhang/mailclaw/actions/workflows/release.yml">Release</a>
</p>

<p align="center">
  <img src="./docs/public/mailclaws-poster.svg" alt="MailClaws 宣传图：一个公开邮箱驱动多个内部智能体协作，所有房间、内部邮件与外发治理都在同一个 Mail 工作台里可见。" width="960" />
</p>

MailClaws 的核心不是“让智能体也能发邮件”，而是把邮件本身变成多智能体工作的运行时。外部来信会落成持久房间，前台公开智能体可以按需拉起研究、审阅、运营和专门角色，通过内部邮件协作，再把结果收束回同一条房间里。每一次接力都看得见，每一次草稿都能审，每一次真实外发都能管。

它最适合这类工作：消息不断插入、会话经常切换、线程会拖很久、过程中必须持续汇报、而且最终回复往往不是一个智能体单打独斗就能稳稳完成。

## MailClaws 的特色优势

MailClaws 押注的不是“更长的上下文”，而是**更清晰的协作边界**。一条真实邮件线程就是一个房间，一个房间里可以有多个智能体协作，但不会再把所有过程揉成一锅看不清的长 transcript。前台智能体负责收件、分诊、ACK 和推进节奏，后台角色通过虚拟邮件接任务、回证据、交草稿、做审阅，最终再由治理链路决定是否真正外发。你看到的不只是“最后结果”，而是一个像现实团队一样会分工、会汇报、会接力的过程。

这也是它为什么更省 token。它不会在每一轮都把整段历史重新灌进模型，而是把真正值得留下来的东西压成预摘要继续往前走。仓库内基准测试里，长线程后续回复的估算 prompt 体积从 **2006** 降到 **755**，第 6 轮后续回复从 **2868** 降到 **752**，5 个工作智能体汇总回主智能体的场景从 **3444** 降到 **750**。这不是单纯省钱，而是让“同时看很多房间”“长任务持续汇报”“多智能体协作仍保持清醒”变成可持续的默认体验。

## 为什么邮件天然适合这件事

邮件天然带着多智能体系统最需要的几个条件：上下文边界清楚，历史天然可追溯，可以直接共享，字数通常正好够表达一轮完整意思，又不会膨胀成难以维护的超长上下文，而且完全符合人类工作习惯。最重要的是，用户不需要再学一套新系统，也不需要额外配置一套“协作协议”，因为收件、回复、转发、抄送，本来就是现实世界里最成熟的协作语言。

## 多智能体能力，放到台面上

- 一个公开智能体可以守住前台邮箱，多个专门智能体在背后协作。
- 内部协作不是隐藏 run，而是虚拟邮箱、协作线程和可回看的内部邮件。
- ACK、进度汇报、审阅、审批、最终外发，全都挂在同一个房间上。
- Workbench 里能看到谁收到了什么、谁回了什么、哪版草稿胜出、哪里被拦下。
- 短期 subagent 只负责计算，不偷走长期人格；常驻智能体才拥有自己的 `SOUL.md`、邮箱和记忆边界。

MailClaws 不是“也支持多智能体”。MailClaws 的主角就是多智能体协作本身。

## 三分钟跑通，让智能体发给你第一封邮件

```bash
./install.sh
MAILCLAW_FEATURE_MAIL_INGEST=true mailclaw
```

再开一个终端：

```bash
mailclaw onboard you@example.com
mailclaw login
mailclaw dashboard
```

然后这样体验：

1. 登录任意一个你已经在用的邮箱。
2. 用另一个邮箱给它发一封测试邮件。
3. 打开工作台，点击 `Mail`。
4. 看这条房间出现、内部协作发生、回复链逐步形成。
5. 让智能体通过受治理的外发链路，给你发来第一封真正的回信。

如果你想先看一个安全的本地演示，运行 `pnpm demo:mail`，然后打开 `http://127.0.0.1:3020/workbench/mail`。

## 模板是为了让你快速上手

模板不是摆设，而是为了让新用户一键获得一个像样的多智能体编制。

- `One-Person Company`：前台收件，后台分工，适合一人团队或很轻的前后台协作形态。它参考了 <https://github.com/cyfyifanchen/one-person-company> 的经营方式，但在 MailClaws 里被落成了真正的常驻角色编制。
- `Three Provinces, Six Departments`：更强的审阅、治理和执行编制，角色结构对齐 <https://github.com/cft0808/edict>。

模板实现代码在这里：

- <https://github.com/dangoZhang/mailclaw/blob/main/src/agents/templates.ts>

应用大编制模板时，生成出来的 `SOUL.md` 会带上上游对齐说明和角色契约，避免只剩名字像、行为却越来越散。

## 网站与工作台

- 网站：<https://dangozhang.github.io/mailclaw/>
- 工作台：运行 `mailclaw dashboard`，登录后点击 `Mail`

网站负责解释概念，工作台负责把系统真相直接展示给你。

## 许可

MIT。见 [LICENSE](./LICENSE)。
