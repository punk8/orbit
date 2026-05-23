# 架构设计

## 稳定数据流

Orbit 的核心架构围绕稳定对象流设计：

```text
Source Adapter
  -> Event Ingestion
  -> Local Event Store
  -> Activity Session Builder
  -> Knowledge Artifact Store
  -> Memory Store
  -> Recommendation Engine
  -> Handoff / Agent Interface
```

Activity 解决“发生了什么”，Knowledge 解决“这段经历沉淀出什么知识”，Memory 解决“哪些内容值得长期记住”，Recommendation 解决“下一步应该注意什么”。

## 模块边界

```text
apps/
  desktop/          Electron 桌面壳、菜单栏、权限引导、审阅和设置 UI
  cli/              本地命令行、只读 Agent 入口、维护命令
packages/
  core/             领域类型、状态机、证据模型、聚合与生成规则
  adapters/         各类 Source Adapter，负责只读采集和标准化
  db/               SQLite、迁移、Repository、FTS、审计和设置
  ai/               AI provider 抽象、任务路由、模型调用边界
  privacy/          脱敏、保留、导出、权限和 release gate 策略
  agent-api/        Agent 可读取资源的统一接口
  ui/               共享 UI 能力
```

`packages/core` 不依赖 Electron、SQLite 或具体 AI provider。适配器不做业务归纳，只把来源转换成 Event。桌面和 CLI 通过 core/db 提供的用例能力工作。

## Source Adapter

每个 Adapter 必须声明：

- source kind、adapter id、display name。
- 权限范围、敏感级别、是否允许 AI、是否允许导出给 Agent。
- 增量读取 cursor。
- source pointer，用于追溯来源。
- 原始数据保留策略。

Adapter 只做采集、解析、脱敏前置和标准化，不直接生成 Knowledge 或 Recommendation。

## Event Store

本地 SQLite 是默认事实存储：

- Events append-oriented。
- Derived objects 可重建，但保留用户审阅状态。
- FTS/vector index 是 sidecar，必须可重建。
- raw payload 默认最小化保存，高风险 raw 数据必须短 TTL、可清理。
- 所有清理、导出、模型调用和审阅动作写入 audit log。

## Activity Session Builder

Activity Session 由 Event 聚合而来。分组信号包括：

- 时间接近程度。
- app/window/source/project/thread 关联。
- 命令、会话、任务和会议边界。
- 低质量片段标记。
- 必要时使用 AI 分类，但必须保留 deterministic fallback。

Activity 可重建，但不能丢失用户对 Knowledge、Memory 和 Recommendation 的审阅状态。

## Knowledge / Memory / Recommendation

Knowledge 是可编辑文档，Memory 是长期小事实，Recommendation 是带证据的建议。

约束：

- Knowledge 必须引用 source session 和 evidence。
- Memory 默认来自 confirmed Knowledge 或用户显式保存。
- Recommendation 必须包含依据、置信度和建议动作。
- 未确认对象默认不进入 Agent Handoff。

## AI Provider 抽象

AI 能力按任务抽象，而不是全局一个模型开关：

- `draftKnowledgeArtifact`
- `extractMemoryCandidates`
- `generateRecommendations`
- `summarizeActivity`
- `embedText`
- `redactSensitiveText`
- `transcribeAudio`
- `extractScreenText`
- `summarizeVision`

Provider 可以是 deterministic、本地模型、Apple Vision、Ollama、本地 HTTP、OpenAI-compatible 或未来托管服务。每次模型调用必须记录 provider、model、任务、输入边界、来源策略和 audit entry。

## Desktop Runtime

Electron 负责：

- 后台常驻和菜单栏。
- 权限状态、运行状态、暂停/恢复/停止。
- 本地数据库路径和设置。
- Source 管理、审阅队列、Activity/Knowledge/Memory/Recommendation/Handoff UI。
- 必要时调用 macOS native helper 做 Screen/OCR、Accessibility、权限检查或系统级采集。

高风险感知能力默认关闭，必须显式开启，并提供清晰的运行状态、保护规则、短保留和清理入口。

## Agent Interface

Agent 接口只读优先：

- `orbit://status`
- `orbit://context/today`
- `orbit://handoff/today`
- `orbit://handoff/project/<project>`
- Knowledge / Memory / Recommendation 搜索与读取

写入 Memory、执行外部动作或修改来源配置必须通过明确授权和审计。
