# 多 Agent 写作模板库

这是一套放在仓库资产目录里的写作团队模板，不进入 `src/` 代码常量。

目录约定：

- `upstream/`：可直接复用的上游原始 prompt / 配置 / 许可证
- `writing/`：适配本项目“多 Agent 写作”的现成模板包
- `index.yaml`：模板索引，方便后续做导入器或工作台接入

## 使用方式

1. 选一个模板目录。
2. 先读该目录下的 `README.md` 和 `template.yaml`。
3. 按角色创建常驻 Agent。
4. 把对应 `*.prompt.md` 内容放进各 Agent 的 `SOUL.md` 或启动 prompt。
5. 按模板里的默认协作流让角色收发内部任务。

## 复用策略

- `edict`、`agentfiles`、`one-person-company` 为 MIT 来源，已放入 `upstream/`。
- `one-person-company` 上游没有成套角色 prompt，本库按其“单人公司”概念补齐写作角色。
- `crewAI` 示例与 `crewai_multi_agent_debate` 被用作角色编排灵感；未见清晰许可证的部分只借概念，不直接抄原文。

## 当前模板

- `three-provinces-six-departments`：三省六部写作院，适合大型报告、白皮书、复杂协作
- `one-person-company`：一人公司内容台，适合创始人内容、个人品牌、轻运营团队
- `newsroom`：新闻编辑部，适合报道、快评、专题稿
- `debate-room`：辩论写作室，适合观点文章、对立论证、立场稿
- `content-studio`：内容策略工作室，适合营销文案、campaign、品牌内容
- `format-router`：格式路由工厂，适合一份素材改写为博客、newsletter、LinkedIn

## 备注

- 这批模板是资产库，不依赖当前代码实现。
- 后续如果要做“一键创建模板”，可以直接读取 `index.yaml` 和各目录的 `template.yaml`。
