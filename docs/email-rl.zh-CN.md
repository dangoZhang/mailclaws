# Work Email 的离线 RL

这条工作流只解决一个窄问题：把 email，尤其是工作 email，压成更适合多智能体协作的上下文包，并且能解释为什么保留这些信息。

## 目标

这次改动想同时提升四件事：

- `read`：少吃无用转述，多保留真正影响回复的字段
- `write`：从结构化 email packet 起草，不靠整段原文反复复述
- `explainability`：每个保留字段都给出短理由
- `multi-agent context`：把更准、更短、更可解释的上下文传给 orchestrator、worker、reviewer

## 数据库候选

| 数据集 | 适合做什么 | 注意点 |
| --- | --- | --- |
| [Enron Email Dataset](https://www.cs.cmu.edu/~enron/) | 企业邮件图谱、thread 恢复、角色路由、长期行为 | 老数据，没有摘要标签 |
| [Avocado Research Email Collection](https://catalog.ldc.upenn.edu/LDC2015T03) | 更现代的 business email，最适合做 work-email 行为学习 | 需要 LDC 许可 |
| [BC3 Email Corpus](https://www.cs.ubc.ca/labs/lci/bc3/download.html) | 线程摘要和句子显著性标注，适合校准保留奖励 | 太小，不能单独训练策略 |
| [W3C Corpus / TREC Enterprise](https://trec.nist.gov/pubs/trec14/papers/ENTERPRISE.OVERVIEW.pdf) | 决策、分歧、长线程解释 | 不是私有企业邮件 |
| [EmailSum](https://github.com/ZhangShiyue/EmailSum) | thread summary 监督，适合测压缩质量 | 只有摘要，不覆盖治理回复 |
| [RADAR Action-Item Dataset](https://www.cs.cmu.edu/~pbennett/action-item-dataset.html) | owner、commitment、next action 抽取 | 是专项信号，不是完整回信数据 |

当前建议的组合：

- 行为策略数据：Enron + Avocado
- 保留奖励校准：BC3 + EmailSum
- action / handoff 校准：RADAR
- explainability / disagreement：W3C

仓库里的数据集目录在 `src/email/datasets.ts`。

## 离线轨迹 RL 设计

仓库里现在落的是一个面向 email schema retention 的离线轨迹策略：

1. 先把每个 email turn 转成状态。
   状态字段包括 `mode`、是否有明确请求、问题、deadline、decision、commitment、附件证据、constraint、risk、多方收件人、open question。
2. 把“保留哪类字段”建成离散动作。
   动作包括 `ask`、`deadline`、`decision`、`commitment`、`artifact`、`constraint`、`risk`、`question`、`reply_style`、`stakeholder`、`next_action`。
3. 在离线轨迹上反向计算 discounted return。
4. 对低支持度和偏离行为策略的动作加保守惩罚。
5. 用排序结果生成 `Current inbound email packet`，并给每个保留字段附一个短 `why`。

这不是论文复刻版，而是 MailClaws 自己的 tabular 变体。思路借了 [CQL](https://arxiv.org/abs/2006.04779) 的 conservative offline learning 和 [AWR](https://arxiv.org/abs/1910.00177) 的 advantage-weighted ranking，但实现完全按 email schema retention 来做。

核心文件：

- `src/email/offline-rl.ts`
- `src/email/schema-policy.ts`
- `src/benchmarks/email-rl.ts`
- `scripts/benchmark-email-rl.mts`

## 运行时接线

现在 orchestrator 和 worker prompt 里，在原始正文之前会先看到一段 email-native packet：

- `Current inbound email packet`
- 保留下来的 schema fields
- 每个字段一条短 `why`

接线位置在 `src/orchestration/service.ts`。

这样做的效果是：

- raw body 还在，完整上下文没丢
- 多智能体先看结构化结果，再看原始正文
- reviewer / guard 能更快知道哪些事实、决策、约束和风险是这封信真正重要的部分

## Benchmark 结果

当前 deterministic benchmark 的结果：

- baseline average reward：`3.17`
- RL average reward：`3.594`
- reward lift：`13.375%`
- baseline coverage：`0.72`
- RL coverage：`0.76`
- coverage lift：`5.556%`
- explainability score：`0 -> 1`

结论很直接：

- RL packet 比固定字段顺序更会保留高价值 email 信息
- 提升最明显的是 `write` 场景，尤其是同时出现 decision、commitment、附件证据的时候
- explainability 的提升是实打实的，因为每个保留字段都有策略理由，不再是纯黑盒压缩

本地运行：

```bash
pnpm benchmark:email-rl
pnpm benchmark:email-rl:json
```

## 当前边界

- 现在内置策略还是 seed trajectories，不是从 Enron / Avocado 真实轨迹直接训练出来的。
- coverage 的提升小于 reward 提升，说明固定基线对部分简单场景并不差。
- 下一步最缺的是 importer，把外部 email corpus 转成 MailClaws 的 state/action/reward JSONL。

## 下一步

下一步最实用的方向是：

- 加一个 corpus importer，把 Enron / Avocado / BC3 / EmailSum 统一转成离线轨迹
- 复用现有 trainer，换成真实 work-email 轨迹训练
- 重新跑 benchmark，把 seed policy 替换掉
