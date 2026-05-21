# Alpha UI Implementation Spec

## 目的

本文把 `AGENTS.md`、`docs/ui-design.md`、`docs/architecture.md`、`docs/data-model.md` 和当前代码状态压缩成下一阶段可执行的 UI / Provider 开发规格。

它不是临时 MVP 规格。第一阶段可以分批交付，但页面结构、数据接口、权限边界、Provider 抽象和治理动作必须按完整产品形态设计。

当前代码基线：

- 主分支最新观察点：`81e3801 merge: goal 7 agent handoff continuity`。
- Electron 已有主导航：Today、Activity、Knowledge、Memory、Recommendations、Handoff、Review Queue、Sources、Settings。
- `DesktopSnapshot` 已暴露 sources、activitySessions、knowledgeArtifacts、memories、recommendations、today、runtime、settings。
- DB 已有 Events、Activity、Knowledge、Memory、Recommendation、Audit、Settings、FTS Knowledge、FTS Memory。
- DB 层已有 Knowledge / Memory edit 能力，Desktop IPC 还未暴露。
- Recommendation 已有 accept、dismiss、snooze、resolve，Desktop UI 的 snooze 还没有日期输入。
- AI Provider 已有 `disabled`、`mock`、`openai-compatible`，当前只用于 `draftKnowledge`。
- Agent continuity 已有 Handoff Pack CLI / Desktop 页面 / read-only resource descriptor 雏形。

## 产品边界

Orbit 的下一阶段开发应继续围绕稳定管线推进：

```text
Source Adapter -> Event -> Activity Session -> Knowledge Artifact -> Memory -> Recommendation
```

开发时必须保持以下边界：

- Activity 是证据层，回答“发生了什么、证据在哪里”。
- Knowledge 是可审阅文档层，回答“这段经历沉淀出了什么知识”。
- Memory 是长期事实层，回答“哪些内容值得长期保留并注入 Agent”。
- Recommendation 是可解释建议层，回答“现在有什么需要注意”。
- Handoff 是 Agent warm-start 视图，不是新的 source of truth。
- Screen / OCR / audio 是未来 Source Adapter 和 Processing 能力，不应把 Orbit 做成截图搜索工具。

视觉参考入口：

- Yansu 的 Activity timeline、Activity playback、Knowledge detail 和 Memory overview 参考图已归档在 `docs/assets/yansu/`，并在 `docs/ui-design.md` 的 “Yansu 参考图归档” 中说明对应的产品约束。
- 后续 UI 开发需要以这些参考图校准产品模式：Activity 还原现场，Knowledge 沉淀可审阅文档，Memory 治理长期事实，Handoff 从这些对象组装 agent continuity。
- 参考图只用于对齐信息架构、交互密度和追溯关系，不用于逐像素复刻，也不应让 Orbit 退化成截图搜索或录屏回放工具。

## 混合 AI Provider 策略

本地模型组件线索有参考价值，但结论不是“默认本地 LLM 推理”，而是“按任务拆 Provider”。

可参考的本地能力信号：

- `onnxruntime`：适合本地 embedding、分类、redaction、小模型推理。
- `sherpa-onnx`：适合本地语音转写。
- `silero_vad.onnx`：适合本地 VAD，减少无意义音频处理。
- `model.int8.onnx`：常见于本地 embedding / rerank / 小模型能力。
- Local ONNX provider：适合可重建 sidecar，如 vector index。
- Ollama：适合作为可选本地生成或 embedding endpoint，不应是唯一 Provider 形态。

任务级 Provider 目标：

| 能力                        | 当前状态                      | Alpha 目标                                             | 默认数据边界                           |
| --------------------------- | ----------------------------- | ------------------------------------------------------ | -------------------------------------- |
| Knowledge drafting          | 已有 mock / OpenAI-compatible | 保持外部可选，继续要求 evidence-backed JSON            | 按 source permission 过滤，审计        |
| Activity summarization      | 确定性摘要为主                | 预留 `summarizeActivity`                               | 默认本地，可外部可选                   |
| Memory extraction           | 确定性候选                    | 预留 `extractMemoryCandidates` Provider                | 默认需 review，不自动 confirmed        |
| Recommendation ranking      | 规则原型                      | 预留 `rankRecommendations` / `generateRecommendations` | 只生成建议，不执行副作用               |
| Embedding / semantic search | 未实现真实向量                | 优先本地 ONNX / Ollama / FTS fallback                  | 本地 sidecar，可重建可删除             |
| OCR / screen text           | research-only                 | 优先 Apple Vision / local OCR                          | 原始截图不默认出本机                   |
| ASR                         | 未实现                        | 本地 sherpa-onnx / Whisper 类能力                      | 音频和 transcript 需短 TTL / 权限      |
| VAD                         | 未实现                        | 本地 Silero VAD 类能力                                 | 只做本地预处理                         |
| Redaction / sensitivity     | 基础 privacy 包               | 本地规则优先，小模型可选                               | 外部 AI 前必须通过                     |
| Handoff compression         | 有 Pack 格式                  | 可加压缩 Provider                                      | 默认只用 confirmed / permitted objects |

Provider 设置不能只有一个全局 `ai.provider`。长期 UI 应拆成：

- Summarization Provider。
- Knowledge Draft Provider。
- Memory Extraction Provider。
- Recommendation Provider。
- Embedding Provider。
- OCR Provider。
- Transcription Provider。
- Redaction Provider。

第一阶段实现可以继续只暴露当前 `ai.provider`，但数据结构和设置文案要避免暗示所有 AI 能力都绑定同一个模型。

生成或索引产物应记录 Provider metadata：

- `task`：如 `draftKnowledge`、`embedText`、`transcribeAudio`。
- `providerKind`：disabled、mock、openai-compatible、local-onnx、ollama、apple-vision。
- `providerId` / `model`。
- `dataBoundary`：local-only、external。
- `inputPolicy`：summary-only、excerpt、raw-allowed。
- `evidenceIds`。
- `auditLogId`。

## 主窗口信息架构

左侧导航保持当前一等入口：

1. Today
2. Activity
3. Knowledge
4. Memory
5. Recommendations
6. Handoff
7. Review Queue
8. Sources
9. Settings

顶部栏保持当前页面标题、日期、刷新入口。后续可增加全局搜索入口，但不要把创建 / 删除 / 外部发送动作放在搜索弹窗主路径中。

页面通用布局：

- 列表型页面采用“筛选栏 + 左侧列表 + 右侧详情 / inspector”。
- Today 采用 dashboard + attention list。
- Sources / Settings 继续采用管理台布局。
- 所有 derived object 详情都必须有 Evidence 区。
- 所有有外部 AI 参与的对象都必须展示 Provider / local-or-external 状态。
- 所有危险动作进入确认流。

当前组件复用：

- `Section`：页面区块。
- `MetricCard`：统计卡。
- `EvidenceList`：证据列表。
- `secondary-button` / `danger-button`：动作按钮。
- i18n：新增用户可见文案必须进入统一 i18n 层。

## Activity 页面规格

目标：从“session 列表”升级为“可追溯证据工作台”。

### 筛选

首批筛选：

- 日期：today、yesterday、自定义日期。
- Source：Codex、SeaTalk、local agent、fixtures，未来 screen/calendar/mail。
- App。
- Project / repository。
- Sensitivity。
- Search query：title、summary、evidence excerpt。

Alpha 可以先在 renderer 基于 `snapshot.activitySessions` 做客户端筛选。事件级搜索需要后续 IPC。

### Session 列表项

必须展示：

- 时间段和持续时长。
- 标题。
- 摘要。
- Source chips。
- App chips。
- Event count。
- Sensitivity badge。
- Local state：rawAvailable、indexed、storageBytes。
- Derived count：linked Knowledge / Memory / Recommendation 数量，初期可从 evidence 反查或暂不显示。

### Session 详情

固定结构：

- Metadata：time range、duration、sourceKinds、apps、project、topic、eventCount、sensitivity、retentionPolicyId。
- Summary：session.summary 或 fallback。
- Evidence：当前 `EvidenceList`。
- Event Stream：按时间列出 linked Events，需要新增 detail IPC。
- Processing：indexed、classification、embedding、AI summary status，未实现能力显示 Not configured / Not available。
- Storage：rawAvailable、storageBytes、retention policy、redaction state。
- Derived Objects：关联 Knowledge、Memory、Recommendation。

### 需要新增的 Desktop API

```ts
getActivitySessionDetail(id): {
  session: ActivitySession;
  events: Event[];
  linkedKnowledge: KnowledgeArtifact[];
  linkedMemories: Memory[];
  linkedRecommendations: Recommendation[];
}
```

如果先不加 API，可先在详情中展示 session 自身字段和 evidence，并把 Event Stream 标记为后续能力。

## Knowledge 页面规格

目标：从“摘要列表”升级为“可审阅知识文档库”。

### 列表和筛选

筛选：

- Status：draft、needs_review、confirmed、rejected、archived。
- Type：daily_brief、debugging_note、decision_record、project_context 等。
- Project。
- Source。
- Date range。
- Search query：FTS search via repository / CLI 已存在，Desktop 需接 IPC。

列表项字段：

- Title。
- Type。
- Status。
- Time window。
- Projects / apps。
- Confidence。
- Source session count。
- Updated at。

### 详情结构

固定结构：

- Header：title、status、type、confidence。
- Metadata：timeWindow、apps、projects、generatedBy、language、createdAt、updatedAt。
- Source Sessions：sourceSessionIds，可点击跳 Activity。
- Description。
- Key Insights。
- Decisions。
- Blockers。
- Follow-ups。
- Markdown Preview。
- Evidence。
- Memory Candidates / Related Memories。
- Provider Metadata：generatedBy、future provider task/model/audit。

### 操作

安全操作：

- Copy Markdown。
- Open source session。
- Search within page。

审阅操作：

- Confirm。
- Reject。
- Archive。
- Edit。

需要补齐：

- Desktop IPC 暴露 `editKnowledgeArtifact`。
- Edit 应是右侧或详情内编辑模式，保存前展示 changed fields。
- Confirm 后如生成 Memory candidates，应提示生成数量并跳转 Review Queue。

建议 API：

```ts
searchKnowledge(query, filters): KnowledgeArtifact[]
updateKnowledgeArtifact(id, patch): KnowledgeArtifact
getKnowledgeArtifactDetail(id): {
  artifact: KnowledgeArtifact;
  sourceSessions: ActivitySession[];
  relatedMemories: Memory[];
}
```

## Memory 页面规格

目标：从“记忆列表”升级为“长期记忆治理台”。

### 首页统计

顶部统计卡：

- Confirmed memories。
- Needs review。
- Archived / rejected。
- FTS indexed count。
- Vector indexed chunks，未实现时显示 disabled。
- Last reindex time，未实现时显示 unavailable。

### 分组和搜索

分组维度：

- Kind：project_fact、user_preference、decision、workflow_pattern、common_issue、relationship_context、domain_knowledge。
- Project / scope。
- Source kind。
- Status。
- Tag。

搜索：

- Keyword：使用现有 FTS。
- Semantic：未来 vector provider。
- Hybrid：keyword + semantic。
- 向量不可用时明确展示 fallback to FTS。

### 详情结构

固定结构：

- Header：title、status、kind、confidence。
- Metadata：scope、tags、createdAt、updatedAt、validFrom、validUntil、lastReviewedAt。
- Body / Memory Points。
- Evidence。
- Source Knowledge。
- Source Sessions。
- Version / supersedes。
- Agent Context Policy：是否允许注入 Agent、适用项目、过期策略。
- Index State：FTS indexed、vector indexed、provider。

### 操作

- Confirm。
- Reject。
- Archive。
- Edit。
- Copy Markdown，未来。
- Delete，需要二次确认并说明 FTS/vector sidecar 会删除。

需要补齐：

- Desktop IPC 暴露 `editMemory`。
- Memory Markdown/JSON source-of-truth 文件层。
- Vector sidecar status。
- Memory 注入策略字段。

## Recommendations 页面规格

目标：让主动建议可解释、可治理、无默认副作用。

### 列表字段

- Title。
- Type：follow_up、risk、blocker、automation_opportunity、recurring_pattern、context_needed。
- Status。
- Suggested action。
- Confidence。
- Impact。
- Due / snooze until。
- Evidence count。
- Side-effect level。

### 详情结构

- Why now：explanation。
- Suggested action。
- Evidence：Event / Activity / Knowledge / Memory。
- Confidence explanation：规则、Provider、证据覆盖。
- Impact scope：project、source、time window、people/apps。
- Side-effect level：
  - Level 0：只读查看、复制、打开来源。
  - Level 1：在 Orbit 内创建草稿。
  - Level 2：写入 Knowledge / Memory，需要确认。
  - Level 3：发送消息、创建任务、修改代码、提交，需要强确认，当前不实现。
- Expiration / dueAt。
- Related Handoff impact：是否应进入 Handoff。

### 操作

当前已有：

- Accept。
- Dismiss。
- Snooze。
- Resolve。

需要补齐：

- Snooze until 日期输入。
- Evidence expansion。
- Recommendation detail view。
- Recommendation candidates 进入 Review Queue。
- `accept` 不执行外部动作，只表示用户采纳该建议。

建议 API：

```ts
getRecommendationDetail(id): {
  recommendation: Recommendation;
  events: Event[];
  sourceSessions: ActivitySession[];
  knowledgeArtifacts: KnowledgeArtifact[];
  memories: Memory[];
}
```

## Review Queue 规格

目标：把所有需要用户确认的自动产物集中治理。

当前已包含：

- Knowledge drafts。
- Memory candidates。

需要补齐：

- Recommendation candidates / new recommendations。
- Redaction warnings。
- Source permission warnings。
- Failed processing items。
- AI provider failed / fallback items。

队列项字段：

- Object type。
- Title。
- Status。
- Confidence。
- Source count。
- Sensitivity。
- Created at。
- Primary action。

动作：

- Confirm / accept。
- Edit。
- Reject / dismiss。
- Archive。
- Open detail。

## Sources 页面规格

当前 Sources 是最接近目标的页面，需要继续加强“来源边界可见”。

必须保持展示：

- Source kind。
- Sensitivity。
- Enabled / paused / error。
- Last sync / last event。
- Permission scope：canStoreRaw、canUseForAI、canExportToAgent、retentionPolicyId、readableFields。
- Adapter config path / cursor state。

需要补齐：

- Source detail drawer。
- Source-level event count、activity count、knowledge count、memory count。
- Delete source impact preview：会影响哪些 raw、events、indexes、derived evidence。
- Per-source AI policy editing。
- Per-source retention editing。
- Protected apps / exclusions，未来 screen source 使用。

## Settings 页面规格

当前 Settings 包含 Provider、Runtime、Storage、Data。下一阶段需要扩展为：

- General：language、menu bar、launch at login。
- Runtime：background collection、last run、health。
- Sources：也可继续独立为 Sources 页面。
- Privacy：global pause、external AI allowed、secret handling、redaction policy。
- Retention：events、raw、media、logs、embeddings。
- AI Providers：按任务拆 Provider，但第一阶段可继续显示当前全局 provider，并标注仅用于 Knowledge drafting。
- Indexing：FTS / vector state、rebuild。
- Agent Interface：CLI、future MCP、local API、Handoff export policy。
- Storage：Orbit home、database path、artifact paths。
- Export / Delete：export context、clear data、source deletion。

Provider 页面必须明确：

- 当前 provider 只用于哪些任务。
- 哪些 source 允许发送给 external provider。
- API key 不回显。
- 测试连接不会发送真实工作上下文。
- 本地 Provider / ONNX / Ollama 是 future selectable capability，不与主 LLM 绑定。

## 搜索与筛选规则

Alpha 可分两层实现：

1. Renderer client-side filters：对 `DesktopSnapshot` 里已有 arrays 做日期、status、source、app、project、sensitivity 筛选。
2. DB-backed search IPC：Knowledge / Memory 已有 FTS repository，Activity / Recommendation 需要新增搜索或 detail use case。

全局搜索结果字段：

- Object type。
- Title。
- Snippet。
- Time。
- Source。
- Project。
- Status。
- Sensitivity。
- Evidence count。

搜索默认不展示 raw secret / failed redaction 内容。

## 状态与确认规则

Knowledge：

```text
draft -> confirmed
draft -> rejected
draft -> archived
```

Memory：

```text
needs_review -> confirmed
needs_review -> rejected
needs_review -> archived
confirmed -> archived
```

Recommendation：

```text
new -> accepted
new -> dismissed
new -> snoozed
new -> resolved
snoozed -> accepted / dismissed / resolved
```

危险动作确认：

- Delete source：必须展示影响范围。
- Clear local data：必须二次确认。
- Delete Memory / Knowledge：必须二次确认。
- External AI enable：必须说明哪些任务会发送数据。
- Screen/audio enable：必须先有权限引导、可见运行状态、暂停入口。

## IPC / API 缺口清单

P0：

- `getActivitySessionDetail(id)`：返回 session、linked events、linked derived objects。
- `searchKnowledge(query, filters)`：接现有 FTS。
- `searchMemory(query, filters)`：接现有 FTS。
- `editKnowledge(id, patch)`：暴露 DB 层已有 edit。
- `editMemory(id, patch)`：暴露 DB 层已有 edit。
- `reviewRecommendation(id, "snooze", { snoozeUntil })`：UI 补日期输入。

P1：

- `getKnowledgeArtifactDetail(id)`。
- `getMemoryDetail(id)`。
- `getRecommendationDetail(id)`。
- `getIndexStatus()`：FTS / vector / embedding provider。
- `getAuditTrail(objectType, objectId)`。
- `previewDeleteSource(sourceId)`。
- `updateSourcePermissionScope(sourceId, patch)`。

P2：

- `globalSearch(query, filters)`。
- `generateKnowledgeFromActivity(sessionId | timeWindow)`。
- `proposeMemoryFromKnowledge(artifactId)`。
- `configureTaskProvider(task, providerConfig)`。
- `getAgentInterfaceStatus()`。

## 开发顺序建议

1. Activity detail：补 `getActivitySessionDetail`，把证据层立起来。
2. Knowledge detail/edit/copy：补文档审阅闭环。
3. Memory search/group/detail/edit：补长期记忆治理。
4. Recommendation detail/evidence/snooze date：补可解释主动建议。
5. Settings Privacy / Provider task boundary：补信任边界。
6. Review Queue 扩展：纳入 recommendations、warnings、failed processing。
7. Index status：先 FTS 状态，再 vector provider。

## 验收标准

每个页面完成时至少满足：

- 用户能从列表进入详情。
- 详情能看到 metadata、evidence、status、privacy/provider 状态。
- 审阅动作不会丢失 evidence。
- 危险动作有确认。
- 新增文案进入 i18n。
- `pnpm test`、`pnpm typecheck`、`pnpm lint` 通过。
- UI smoke test 覆盖主导航和至少一个详情展开。

下一阶段不是追求一次性实现所有未来能力，而是让每个已实现入口都沿完整产品目标生长：可追溯、可审阅、可治理、可解释。
