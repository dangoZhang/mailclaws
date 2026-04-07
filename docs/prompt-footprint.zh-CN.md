# Prompt 体积

MailClaws 当前采用 **pre-first** 行为模型：

- 优先读取最新一封 inbound
- 读取最新持久化的 Room Pre snapshot
- 旧上下文按 ref 拉取
- 默认不回灌整段 transcript

本页说明仓库内自带的 prompt 体积基准，用来估算这一架构相对 transcript-first 基线能节省多少 prompt 量。

## 运行方式

```bash
mailctl benchmark prompt-footprint
mailctl --json benchmark prompt-footprint
pnpm benchmark:prompt-footprint
pnpm benchmark:prompt-footprint:json
```

## 当前实测

基于 `2026-03-28` 的仓库内基准：

- 长线程 follow-up 平均：`755` vs `2006` 估算 token，降低 `62.3%`
- 第 6 轮 follow-up：`752` vs `2868`，降低 `73.8%`
- 5 worker reducer 汇总：`750` vs `3444`，降低 `78.2%`

## 含义

- 相比 session-first / full-transcript 基线，MailClaws 在长线程里通常能把主编排 prompt 压低到约 `60%` 到 `75%` 的节省区间。
- 在多 agent fan-in 场景里，reducer summary 能避免主 orchestrator 重读所有 worker transcript，节省通常接近 `75%` 到 `80%`。

## 说明

- 这里不是 provider 实际计费 token。
- 估算公式是 `ceil(characters / 4)`。
- 回归测试见 `pnpm vitest run tests/prompt-footprint-benchmark.test.ts`。
