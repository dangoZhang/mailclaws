# 安全边界

MailClaws 将所有入站邮件、头部和附件都视为不可信输入。

## 入站防护

在消息进入编排层之前，当前实现会先执行三类检查：

- `sender policy`：拒绝规则优先，允许规则必须显式配置；一旦配置 allowlist，则默认必须命中。
- `loop guard`：自动回复、群发/list、noreply 风格流量会被前置拦截。
- `attachment policy`：超大附件、不支持 MIME、附件数量异常会在 agent 可见前被拒绝。

这组策略刻意偏保守，目标是优先阻断循环邮件、垃圾流量放大和不安全附件处理。

## 运行时与数据暴露

- Room kernel 状态、审批、outbox intent、replay trace 都是可审计、可观测的。
- provider/account 的敏感配置在默认 operator 与模型可见面会做脱敏处理。
- 内部协作走 virtual mail 投影和 room-scoped retrieval，不直接把原始 provider payload 暴露给执行路径。

## 当前发布边界

- 本仓库已覆盖并通过 secrets/redaction 相关安全回归测试。
- 当前 Mail I/O 仍与运行时同进程；“完全隔离的外部 mail-I/O sidecar 边界”尚未在本仓库内交付。
- 因此本版本不能对外宣称“全路径硬隔离”已经完成。

## 发布验证

- 运行 `pnpm test:security` 检查脱敏与暴露回归。
- 架构边界声明请与 [ADR-001 架构决策](./adr/ADR-001-architecture.md) 保持一致。
