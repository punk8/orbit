# Orbit — AI 开发指南

Orbit 是一个独立的个人工作上下文工具，目标是在后台默默记录、归纳和总结用户日常工作中的重要信息，并在合适的时候提供回顾、提醒和主动建议。

它不是任何单一工具或应用的附加功能。具体数据源都只是可替换的 source adapter；长期方向是成为一个外部工作助手：持续理解用户的工作上下文，沉淀可检索的记忆，并把零散事件整理成有用的总结、洞察和行动建议。

## 产品定位

- **后台记录**: 在不打扰用户的前提下记录日常工作上下文，包括任务推进、讨论结论、代码变更、问题排查、待办和决策。
- **归纳总结**: 将碎片化信息整理为日报、周报、项目回顾、问题脉络、决策记录和可复用知识。
- **主动推荐**: 基于上下文发现遗漏、风险、重复工作、待跟进事项，并在合适时机给出建议。
- **长期记忆**: 保存对用户真正有价值的工作记忆，而不是简单备份原始数据。
- **独立产品**: 数据源可以替换和扩展，核心价值是“理解与整理工作上下文”，不是绑定某一个应用。

## 一阶原则

- **核心稀缺资源是上下文连续性**: 用户真正需要的不是更多原始记录，而是在跨天、跨工具、跨项目时不用反复解释“我在做什么、为什么这么做、之前发生了什么”。
- **原始数据是成本，结构化记忆才是价值**: 聊天、屏幕、命令、代码和会议记录都只是证据来源；Orbit 应优先沉淀可检索、可解释、可复用的 Memory、Brief、Insight 和 Recommendation。
- **信任来自边界和可追溯性**: 每条重要记忆、总结和建议都应能回到来源事件；用户必须知道 Orbit 读了什么、保存了什么、为什么给出这个判断，以及如何删除或关闭。
- **数据源会变化，Event schema 是稳定层**: 聊天、桌面活动、日历、邮件、文档、会议、代码仓库、任务系统和本地文件等都只是 source adapter；核心逻辑必须围绕统一事件模型、处理流水线和记忆层设计。
- **主动性必须克制且有依据**: Orbit 可以主动提醒风险、遗漏和待跟进，但必须说明依据、置信度和建议动作；默认不替用户执行有副作用的操作。
- **先成为可靠的上下文系统，再成为自动化代理**: 自动执行、代发消息、改代码、建任务等能力必须建立在可靠的记录、总结、权限和审计基础上。

## 数据源策略

不要把 Orbit 的产品方向或架构实现绑定到某几个早期应用或工具。开发时应优先围绕通用 source adapter 能力设计：

- **用户明确授权的本地来源**: 本地文件、导入包、项目目录、笔记、日志、导出的会话记录等。
- **系统权限授予的桌面来源**: 窗口、应用活动、Accessibility、剪贴板、屏幕理解、OCR、音频转写等；这些能力必须显式授权，并能暂停、关闭和清理。
- **工作系统来源**: 日历、邮件、文档、会议、代码仓库、任务系统、IM/协作工具等；每个来源都必须声明权限范围、敏感级别、保留策略和可导出边界。

任何具体来源都应被视为可替换 adapter。第一阶段可以使用 fixtures 或用户明确提供的导入样本验证链路，但不要在产品文案、架构边界或长期任务规划中把某个具体应用当成默认中心。

## 设计原则

- **默认克制**: 优先总结和提示，不主动替用户执行有副作用的操作。
- **用户可审阅**: 重要归纳、记忆写入、推荐动作应可追溯到来源。
- **隐私优先**: 原始数据只在必要时保存；尽量保存结构化摘要、引用指针和最小必要片段。
- **来源可扩展**: 所有输入都应抽象为 source adapter，不让核心逻辑绑定具体应用。
- **事件驱动**: 优先基于事件、增量日志和明确触发器工作，避免无意义轮询。
- **可解释推荐**: 主动建议必须说明依据、置信度和建议动作。
- **渐进自动化**: 先做记录和总结，再做提醒，最后再考虑半自动或自动执行。
- **完整产品视角**: 代码开发不要只按 MVP 临时方案推进；即使第一阶段交付范围有限，也应从可完整上线、可长期演进、可扩展接入多数据源的产品形态出发设计架构和实现。
- **Mac 应用选型**: 如果开发 macOS 桌面应用，默认技术选型为 Electron，并围绕后台常驻、系统权限、菜单栏/托盘、自动更新和本地数据安全来设计。
- **不要做成截图搜索工具**: 屏幕录制、OCR、时间线和回放只是能力之一；Orbit 的产品中心是工作事件理解、长期记忆、上下文总结和可解释建议。
- **本地优先但接口开放**: 默认在本地采集、处理和存储；同时提供 CLI、MCP、Skill 或本地 HTTP API，让外部 Agent 能在授权范围内读取上下文。
- **可替换 AI Provider**: 总结、分类、embedding、OCR 后处理等 AI 能力应抽象 provider，允许本地模型、用户自带 API key 或未来托管服务按权限和成本策略切换。
- **多语言优先，必须支持中文**: Orbit 的桌面 UI、CLI 面向用户的输出、设置项、错误提示、审阅动作、Knowledge/Memory/Recommendation 的生成语言都应预留多语言能力。中文是一等支持语言，不要把英文文案硬编码进业务逻辑；新增用户可见文案必须进入统一 i18n/locale 层，并考虑中英文长度差异、日期时间本地化和后续按项目/用户偏好生成中文总结。
- **主动识别 checkpoint 并提交推送**: 完成一组自洽、验收通过、适合沉淀的代码或文档变更后，应判断当前工作区是否到达 checkpoint。若是合适时机，先确认 `git status` 中没有无关或用户未授权的改动混入，执行必要测试/验收命令，然后主动创建语义清晰的 commit 并 push 到当前远端分支。若存在未完成工作、测试失败、敏感数据、未确认副作用、或工作区包含不属于本任务的改动，则不要强行提交，应说明阻塞和建议的下一步。

## 核心对象

- **Event**: 从外部来源捕获的原始事件，如消息、提交、命令、测试结果、屏幕片段。
- **Activity Session**: 由一组相关 Event 聚合出的工作片段，如 16:37-16:42 的开发过程、一次会议、一次排障、一次代码提交前后的连续活动。它负责还原现场，不直接等同于长期记忆。
- **Knowledge Artifact**: 从一个或多个 Activity Session 归纳出的可审阅知识文档，如排障总结、会议结论、项目背景、方案复盘、日报、周报、问题脉络。它应包含 metadata、来源 session、描述、关键洞察，并允许用户编辑或确认。
- **Memory**: 经用户确认或高置信归纳后的长期记忆，如项目事实、用户偏好、常见问题、关键决策、稳定工作模式。Memory 应比 Knowledge Artifact 更小、更稳定、更适合长期检索和注入 Agent 上下文。
- **Brief**: Knowledge Artifact 的一种，面向时间窗口的总结，如日报、周报、上午进展、会议前摘要。
- **Insight**: Knowledge Artifact 或 Recommendation 的基础信号，从上下文中发现的模式、风险、阻塞或机会。
- **Recommendation**: Orbit 主动给出的下一步建议，需要包含依据和可执行动作。
- **Source Adapter**: 连接外部数据源的适配层，如 file adapter、desktop activity adapter、screen adapter、calendar adapter、mail adapter、repository adapter、task adapter。

## 架构方向

Orbit 的长期架构应围绕以下稳定层推进：

1. **Source Adapter**: 负责接入本地文件、导入包、桌面活动、Screen、Calendar、Mail、Docs、Repository、Task System 等来源，只做采集、权限声明和来源元数据标注。
2. **Event Ingestion**: 将不同来源标准化为统一 Event，保留 source pointer、时间、应用、窗口、项目、参与者、敏感级别和原始引用。
3. **Local Event Store**: 本地优先保存事件和索引，按来源、敏感级别和用户配置执行保留、清理、加密和删除策略。
4. **Activity Session Builder**: 将连续、相关、同主题的 Event 聚合成 Activity Session，记录时间段、涉及应用、事件数量、来源、录屏/截图引用和本地存储状态，用于还原现场和作为后续归纳证据。
5. **Processing Pipeline**: 做去重、分段、OCR/Accessibility 提取、语义分类、embedding、FTS 索引和任务/决策/阻塞识别。
6. **Knowledge Artifact Store**: 从 Activity Session 生成可审阅知识文档，包含 metadata、source sessions、description、key insights、相关项目/应用和编辑历史。日报、周报、会议纪要、排障总结都属于这一层。
7. **Memory Store**: 从 Knowledge Artifact 或高价值 Event 中提炼长期记忆，优先使用人类可读的 Markdown/JSON 作为事实层，SQLite/vector index 作为可重建 sidecar。不要把所有 Knowledge Artifact 自动写入 Memory。
8. **Brief/Insight Engine**: 从事件、活动、知识和记忆生成日报、周报、项目回顾、问题脉络、风险、阻塞和待跟进。
9. **Recommendation Engine**: 输出建议时必须包含依据、置信度、影响范围和建议动作，不直接执行副作用操作。
10. **Agent Interface**: 提供 CLI、MCP、Skill、本地 API 等只读优先接口；写入记忆和自动化动作需要明确授权与审计。
11. **Desktop Shell**: Electron 负责菜单栏/后台常驻、状态展示、权限引导、设置、审阅队列、检索和摘要 UI；必要时通过 native helper 处理屏幕采集、Apple Vision OCR、Accessibility 和系统权限。

核心数据流应优先按以下路径设计：

`Source Adapter → Event → Activity Session → Knowledge Artifact → Memory → Recommendation`

其中 Activity Session 解决“发生了什么”，Knowledge Artifact 解决“这段经历沉淀出了什么知识”，Memory 解决“哪些内容值得长期记住”，Recommendation 解决“基于这些上下文下一步应该注意什么”。

## 同类项目参考

- **Yansu**: 参考其“活动 / 知识库 / 记忆”三层 UI 与“观察工作流 → 结构化知识 → Agent 连续性 / 后台执行”的产品方向。Activity 负责还原现场，Knowledge 负责可审阅文档，Memory 负责长期可检索片段；Orbit 需要保持独立数据源和本地优先边界。
- **Familiar**: 优先参考 Electron macOS 包装、Apple Vision OCR、markdown 输出、剪贴板上下文、敏感信息 redaction 和 Agent context feed。
- **Dayflow**: 参考自动工作日志、timeline activity card、日报/周报、standup、chat with work journal 和 AI provider choice。
- **screenpipe**: 参考 accessibility-first capture、OCR fallback、音频转写、MCP、插件/pipe、权限过滤和事件驱动采集。
- **Dory**: 参考 Markdown source of truth、SQLite/vector sidecar、CLI/HTTP/MCP、wake/search/get/write/link 的共享 Agent 记忆层。
- **Retrace / Pensieve / OpenRecall / Windrecorder**: 只作为屏幕采集、OCR、时间线、FTS/vector search、视频压缩、保留策略的技术参考；注意 AGPL/GPL 类许可证风险，不直接复制受限代码。

## MVP 方向

第一阶段先做一个本地优先的最小产品，但产品核心目标应明确为“后台持续监听用户在电脑上的授权操作上下文，并沉淀为 Event / Activity Session / Knowledge Artifact / Memory / Recommendation”。导入样本和显式本地来源用于先验证数据链路，不应替代后台观察能力。

MVP 只用于明确阶段性交付优先级，不应成为代码设计的上限。实现时需要预留完整产品能力，包括数据源扩展、权限边界、记忆治理、可追溯摘要、推荐解释和后续上线部署所需的稳定性。

1. 先用用户明确授权的本地来源或导入样本验证只读上下文链路。
2. 将事件标准化为统一 Event schema。
3. 建立后台观察运行时，优先采集低风险的 app/window/runtime 事件，再逐步接入 Accessibility、显式目录、终端/浏览器元数据、剪贴板策略。
4. 生成当天工作摘要，包括完成事项、关键讨论、代码变化、阻塞和待跟进。
5. 建立本地 memory store，保存用户确认有价值的长期记忆。
6. 提供“今天有什么需要我注意”的主动建议列表。
7. 屏幕帧、OCR、音频和会议转写必须在权限、可见运行状态、暂停/停止、受保护应用、短 TTL、redaction、审计和资源预算完整后再启用。

## 开发执行顺序

进入代码开发时，默认使用 `docs/development-tasks.md` 中定义的大 goal 顺序推进，不要把全部任务混在一个无检查点的大 goal 里：

1. **Goal 1: Local Data Spine**: 完成 Task 1-5，建立 pnpm monorepo、核心类型、SQLite、本地 fixtures、fixture ingestion 和基础 CLI。该阶段不得实现完整 Electron UI、真实个人数据 source adapter、外部 AI 或读取私人本地数据。
2. **Goal 2: Semantic Pipeline**: 完成 Task 6-10，建立 Activity Session、Knowledge draft、Memory candidate、Recommendation 和 `orbit context today`。该阶段继续使用 mock AI provider，不执行任何副作用动作。
3. **Goal 3: Product Shell And Real Sources**: 完成 Task 11-13，建立 Electron shell、真实来源的只读 adapter 能力，以及安全接入决策。任何来源如果没有明确安全 read path，只保留 fixture-backed 或 approved-import adapter 并记录 blocker。
4. **Goal 4: Background Observation Core**: 完成 Task 14-18，建立后台观察运行时、权限 UX、Tier 1 app/window/runtime 事件、Tier 2 permissioned semantic observation、受保护应用、redaction/retention/audit，以及 live observation 到 Activity/Knowledge/Memory/Recommendation/Handoff 的链路。具体实现应优先按 `docs/background-observation-implementation-plan.md` 拆成 Goal 4A/4B/4C/4D 小 checkpoint 推进，不要一次性吞掉完整后台观察范围。该阶段不得默认开启 raw screen recording、OCR、音频或外部副作用。
5. **Goal 8: Alpha Perception And Context Completion**: 在 Goal 7 的感知 readiness 和 Handoff 基础上，按 `docs/alpha-perception-and-context-completion.md` 的 8A/8B/8C/8D/8E/8F checkpoint 推进 screen/OCR/vision/audio/transcript 能力。该阶段允许实现完整 Alpha 感知能力，但仍必须显式授权、可见运行、可暂停/停止/删除、受保护应用优先、短 TTL、redaction、审计、AI provider policy 和默认 Handoff 排除 raw perception payload；不得默认开启 raw screen recording、OCR、音频、keystroke capture、silent browser scraping 或 arbitrary filesystem scanning。

每个 goal 必须执行 `docs/development-tasks.md` 中对应的 acceptance commands，并在结果中说明哪些验收通过、哪些因环境或依赖无法执行。只有前一个 goal 的核心验收通过后，才应进入下一个 goal。

## 安全与权限

- 读取聊天、代码、屏幕内容前必须明确数据范围和授权边界。
- 屏幕录制能力必须显式授权，并提供清晰的开启、暂停和停止状态。
- 不默认上传原始消息、屏幕录制或代码内容到远端服务。
- 不在未确认的情况下发送消息、修改代码、创建任务、提交或推送。
- 对敏感内容做最小化存储，优先保存摘要、hash、时间和来源引用。

## 命名语义

Orbit 表示“围绕用户工作流持续运行的助手”。它不只是 archive 或 backup，而是在外部安静地观察、整理和提醒，帮助用户保持上下文连续。
