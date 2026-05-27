# 目前待办项

当前所有待办都应服务 [当前目标：产品可用](current-goal.md)。后续设计和开发优先把真实端到端工作流做顺，而不是单独堆底层能力或只做静态视觉美化。

## 最高优先级

1. 收敛产品可用的首批闭环。
   - Today 产品化首页：真实活动、来源状态、知识草稿、建议和下一步行动能一屏扫读。
   - Activity 证据浏览：时间线、证据索引、事件流、来源策略和原始数据状态能互相跳转。
   - Knowledge / Review 审阅工作台：总结内容、Markdown 预览、证据、确认/拒绝/归档形成闭环。
   - Handoff 交接包：Today/Project 范围、安全边界、包含/排除理由、Markdown/JSON 预览完整可见。

2. 用真实本地数据继续验证核心链路。
   - Codex/local agent 显式路径导入。
   - 真实 Screen/OCR 手动捕获。
   - SeaTalk 只在存在安全只读导入路径后接入。

3. 收敛桌面首屏体验。
   - Today 直接展示真实活动、来源状态和下一步建议。
   - Sources 明确显示每个来源读取范围、权限、保留和导出边界。
   - Activity 支持从摘要跳回证据。

4. 完成隐私与治理闭环。
   - raw 数据最小化。
   - 高风险来源短保留和一键清理。
   - Knowledge / Memory / Recommendation 审阅动作完整可追溯。
   - Handoff 默认排除不可导出和未确认内容。

## 产品功能待办

- 完善 Today 日报：完成事项、讨论结论、代码变化、阻塞和待跟进。
- 完善 Activity playback：时间线、事件流、证据索引和低质量片段提示。
- 完善 Knowledge 编辑、确认、拒绝、归档、翻译和 Markdown 导出。
- 完善 Memory candidate 审阅、版本历史、过期/复核和删除。
- 完善 Recommendation 排序、snooze、resolve、dismiss 和证据解释。
- 完善 Handoff pack：Today、Project、Markdown、JSON、Agent-safe 过滤。
- 增加中文优先的 UI 文案、日期时间本地化和总结语言偏好。

## 来源接入待办

- Codex：继续适配真实 Desktop JSONL 格式变化，保持只读和增量 cursor。
- Local Agent：支持 Claude Code 等本地会话导入，保留 provider/app 元数据。
- Desktop：实现显式授权后的应用/窗口/Accessibility/文件/终端/剪贴板事件。
- Screen/OCR：从手动捕获推进到可见、可暂停、低频、短保留的后台采集。
- SeaTalk：等待明确安全 read path；没有路径前不做私有读取。
- 后续来源：日历、邮件、文档、会议、任务系统、代码仓库和浏览器扩展。

## 工程待办

- 删除依赖样本数据的产品入口和测试路径后，继续补真实导入路径测试。
- 保持 `pnpm typecheck`、`pnpm test`、`pnpm lint` 为基础验收。
- 保持 package smoke，验证打包产物不包含私密数据、临时目录或 raw sidecar。
- 把桌面手动验证脚本转为真实本地数据流程，而不是内置样本流程。
- 建立真实 dogfood 数据的脱敏审计流程，不把私人原文提交进仓库。

## 近期人工验收发现

- 2026-05-24 packaged app + Computer Use 走查：使用最新 `apps/desktop/release/mac-arm64/Orbit.app` 可打开 Today、Activity、Knowledge、Review Queue、Handoff、Sources 和 Settings；Today 能扫读来源状态、活动、知识草稿、建议和下一步行动；Activity 能看到时间线、事件流、证据、来源策略、处理状态、存储状态和派生产物；Knowledge/Review 能看到 Markdown 预览、证据和确认/拒绝/归档按钮；Handoff 能生成 Markdown/JSON 预览，并默认排除不可导出来源、草稿知识、未确认记忆和 raw 私密载荷。
- Computer Use 验收需要指定完整 app 路径并核对进程环境；当前多个 worktree 使用相同 `dev.orbit.local` bundle id，容易串到旧打包产物或旧 `ORBIT_HOME`。后续应给本地验收脚本增加明确的 app path、数据目录和进程检查。
- 2026-05-25 已收敛：Handoff 顶部指标已区分“可安全交接”“最近活动总数”“按策略排除”和“证据”，生成后会显示安全摘要和过滤结果，不再让最近活动数像凭空消失。
- 2026-05-25 已收敛：Activity playback 不再在画面预览里裸露 raw sidecar 本地路径；raw 可用、已过期、已清理、受保护应用阻止、来源禁用等状态会用用户可理解文案表达，并保留 evidence pointer。
- 2026-05-26 已收敛：Sources 增加显式本地导入入口，Codex/local agent/SeaTalk 路径先预览事件数、时间范围、项目和警告，用户确认后才写入 Event/Activity/Knowledge；导入来源标记为“显式导入 / import-only”，后台调度不会把它误报成缺少 adapter path 的同步错误。
- 2026-05-26 packaged app + Computer Use 走查：使用 `/tmp` 安全同日 Codex JSONL 可在 Sources 预览 4 条事件并确认导入；Today 显示 Codex Local Sessions、同日活动和知识草稿；Activity 可打开 Codex 片段并看到事件流、证据索引、来源策略和“未保存 raw”；Knowledge 可确认草稿；Handoff 生成后包含确认知识、证据索引和按策略排除列表。
- 2026-05-27 已收敛：Today 和 Sources 增加真实单次 Screen/OCR 入口，用户明确点击后才捕获当前屏幕；默认 screen policy 改为 `perception_summary_only`、`canStoreRaw=false`，conservative sampling 不再写 raw sidecar；CLI mock burst、desktop one-shot capture 和 Activity playback 都按 raw not stored 路径验收。
- 2026-05-27 packaged app + Computer Use 走查：重新打包并启动 `apps/desktop/release/mac-arm64/Orbit.app` 后，Today 可见“捕获当前工作现场”入口和来源状态；Sources 可见“单次屏幕 / OCR 捕获”、策略快照 `conservative / Raw disabled`、Screen/OCR `perception_summary_only / 不保存 raw / 禁止导出给 Agent`；点击捕获后写入真实 Screen/OCR 事件并刷新 Activity/Knowledge，DB 元数据确认最新 session `rawAvailable=0` 且没有新增 raw sidecar 文件。
- 2026-05-27 已收敛：新增四份产品可用改造 spec，覆盖 Activity 最新捕获定位、Knowledge / Review Queue 工作台、Recommendation 去重与动作闭环、显式真实来源扩展，并按 spec 落地实现。
- 2026-05-27 已收敛：Screen/OCR 捕获结果会返回只含 ID 的 focus hint，桌面端捕获后自动跳到刚生成或更新的 Activity session；Activity 会清理临时筛选、切到时间线并显示“已定位到刚捕获的工作现场”，避免用户在历史列表里找。
- 2026-05-27 已收敛：Knowledge 支持 focused artifact 导航，编辑态形成“字段编辑 + Markdown 预览 + 证据”同屏工作台；Review Queue 卡片增加置信度、证据数、来源 session、敏感级别、证据展开和“在知识中打开”，确认/拒绝/归档路径更顺。
- 2026-05-27 已收敛：Recommendation 生成增加稳定 dedupe key，语义 pipeline 会把同一开放建议合并证据/置信度/影响等级并写入 `recommendation.dedupe_merge` 审计；Recommendations 页面默认只看 active，并支持 active / snoozed / closed / all 队列筛选，动作区明确“仅记录选择，不自动执行外部操作”。
- 2026-05-27 已收敛：Sources 显式导入扩展到 local agent、项目目录 metadata、浏览器 metadata JSON、终端命令 JSON、文件活动 JSON；新来源默认 import-only、需要用户预览后确认，后台 ingestion 会跳过 import-only，项目目录只生成文件路径/mtime/hash metadata，不读取文件正文。
- 2026-05-27 checkpoint 验收：`pnpm typecheck`、`pnpm test`（47 files / 242 tests）、`pnpm lint`、`pnpm --filter @orbit/desktop build`、`pnpm --filter @orbit/desktop package:dir` 均已通过；package smoke 未发现 `.db` / `.sqlite` / `.jsonl` / autoresearch / `research-results.tsv` / `fixtures` / `.tmp` / `perception-sidecars` 混入 `apps/desktop/release/mac-arm64/Orbit.app`。
- 2026-05-28 已收敛：Today 增加 Handoff readiness 预检，首屏显示将纳入、会排除和待审阅数量；可直接点击“生成今天交接包”，生成后带着 Markdown/JSON 结果跳到 Handoff 页，不再要求用户先进入 Handoff 再二次点击。Handoff 页面支持接收 Today 生成的结果并显示来源提示。
- 2026-05-28 checkpoint 验收：`pnpm typecheck`、`pnpm test`（47 files / 244 tests）、`pnpm lint`、`pnpm --filter @orbit/desktop build`、`pnpm --filter @orbit/desktop package:dir` 均已通过；package smoke 未发现 `.db` / `.sqlite` / `.jsonl` / autoresearch / `research-results.tsv` / `fixtures` / `.tmp` / `perception-sidecars` 混入 `apps/desktop/release/mac-arm64/Orbit.app`。
- 2026-05-28 已收敛：显式真实来源导入确认后会返回 `source_import` Activity focus，桌面端复用既有 focus 导航直接打开本次导入生成的 Activity session；Sources 预览区会提前说明确认后跳转到生成片段，避免用户导入 Codex / local agent / 项目目录 / 浏览器 / 终端 / 文件活动后在历史列表里寻找。
- 2026-05-28 checkpoint 验收：`pnpm typecheck`、`pnpm test`（47 files / 244 tests）、`pnpm lint`、`pnpm --filter @orbit/desktop build`、`pnpm --filter @orbit/desktop package:dir` 均已通过；package smoke 未发现 `.db` / `.sqlite` / `.jsonl` / autoresearch / `research-results.tsv` / `fixtures` / `.tmp` / `perception-sidecars` 混入 `apps/desktop/release/mac-arm64/Orbit.app`。
- 2026-05-28 已收敛：Sources 导入预览从单纯事件计数扩展为确认前边界审阅，展示来源名称、事件数、时间范围、项目、应用、警告数、读取字段、raw 存储、AI 使用和 Agent 导出策略；用户在确认真实来源导入前能看清 Orbit 会读什么、保存什么、能否进入 Handoff。
- 2026-05-28 checkpoint 验收：`pnpm typecheck`、`pnpm test`（47 files / 244 tests）、`pnpm lint`、`pnpm --filter @orbit/desktop build`、`pnpm --filter @orbit/desktop package:dir` 均已通过；package smoke 未发现 `.db` / `.sqlite` / `.jsonl` / autoresearch / `research-results.tsv` / `fixtures` / `.tmp` / `perception-sidecars` 混入 `apps/desktop/release/mac-arm64/Orbit.app`。
- 2026-05-28 已收敛：Sources 显式导入支持系统路径选择器，Codex / local agent / SeaTalk / 项目目录默认选择文件夹，浏览器 / 终端 / 文件活动导入选择文件；选择器只回填路径，不自动预览、不导入、不扫描，用户仍需显式点击预览和确认。
- 2026-05-28 checkpoint 验收：`pnpm typecheck`、`pnpm test`（47 files / 244 tests）、`pnpm lint`、`pnpm --filter @orbit/desktop build`、`pnpm --filter @orbit/desktop package:dir` 均已通过；package smoke 未发现 `.db` / `.sqlite` / `.jsonl` / autoresearch / `research-results.tsv` / `fixtures` / `.tmp` / `perception-sidecars` 混入 `apps/desktop/release/mac-arm64/Orbit.app`。
- 2026-05-28 已收敛：Activity focus token 保留来源动作 reason，Screen/OCR 捕获显示“刚捕获生成”，显式来源导入显示“刚导入生成”，避免用户从浏览器/终端/项目目录导入后看到误导性的捕获文案。
- 2026-05-28 checkpoint 验收：`pnpm typecheck`、`pnpm test`（47 files / 244 tests）、`pnpm lint`、`pnpm --filter @orbit/desktop build`、`pnpm --filter @orbit/desktop package:dir` 均已通过；package smoke 未发现 `.db` / `.sqlite` / `.jsonl` / autoresearch / `research-results.tsv` / `fixtures` / `.tmp` / `perception-sidecars` 混入 `apps/desktop/release/mac-arm64/Orbit.app`。
- 2026-05-28 已收敛：Handoff Project 范围不再默认写死为 `orbit`；页面会从当前真实 Activity、Knowledge 和 Memory 中提取项目候选，未检测到项目时提示用户手动输入，并保留手动输入不被刷新覆盖。
- 2026-05-28 checkpoint 验收：`pnpm typecheck`、`pnpm test`（47 files / 244 tests）、`pnpm lint`、`pnpm --filter @orbit/desktop build`、`pnpm --filter @orbit/desktop package:dir` 均已通过；package smoke 未发现 `.db` / `.sqlite` / `.jsonl` / autoresearch / `research-results.tsv` / `fixtures` / `.tmp` / `perception-sidecars` 混入 `apps/desktop/release/mac-arm64/Orbit.app`。
- 2026-05-28 已收敛：Today 最近活动卡片增加“打开证据”动作，可直接跳到对应 Activity session 并清理过滤器显示证据详情；Activity 会显示“从 Today 选择”的定位提示，补齐首屏扫读到证据追溯的闭环。
- 2026-05-28 checkpoint 验收：`pnpm typecheck`、`pnpm test`（47 files / 245 tests）、`pnpm lint`、`pnpm --filter @orbit/desktop build`、`pnpm --filter @orbit/desktop package:dir` 均已通过；package smoke 未发现 `.db` / `.sqlite` / `.jsonl` / autoresearch / `research-results.tsv` / `fixtures` / `.tmp` / `perception-sidecars` 混入 `apps/desktop/release/mac-arm64/Orbit.app`。
- 2026-05-28 已收敛：Today 知识草稿卡片增加“审阅草稿”动作，可直接打开对应 Knowledge artifact 的审阅工作台，复用现有 focus 机制清理搜索/筛选并定位到 Markdown 预览、证据和确认/拒绝/归档操作。
- 2026-05-28 checkpoint 验收：`pnpm typecheck`、`pnpm test`（47 files / 246 tests）、`pnpm lint`、`pnpm --filter @orbit/desktop build`、`pnpm --filter @orbit/desktop package:dir` 均已通过；package smoke 未发现 `.db` / `.sqlite` / `.jsonl` / autoresearch / `research-results.tsv` / `fixtures` / `.tmp` / `perception-sidecars` 混入 `apps/desktop/release/mac-arm64/Orbit.app`。
- 2026-05-28 已收敛：Today 建议卡片增加“处理建议”动作，可直接打开对应 Recommendation action workbench；Recommendations 页面会清理队列/搜索/筛选、定位到该建议并显示从 Today 跳入提示，用户可以继续接受、忽略、稍后提醒或标记解决，且动作仍只更新本地审阅状态、不触发外部副作用。
- 2026-05-28 checkpoint 验收：`pnpm typecheck`、`pnpm test`（47 files / 248 tests）、`pnpm lint`、`pnpm --filter @orbit/desktop build`、`pnpm --filter @orbit/desktop package:dir` 均已通过；package smoke 未发现 `.db` / `.sqlite` / `.jsonl` / autoresearch / `research-results.tsv` / `fixtures` / `.tmp` / `perception-sidecars` 混入 `apps/desktop/release/mac-arm64/Orbit.app`。
- 2026-05-28 packaged app 验收：`pnpm --filter @orbit/desktop package:smoke -- --app release/mac-arm64/Orbit.app --orbit-home /tmp/orbit-package-smoke-recommendation-check` 通过，确认最新 release 包可启动、preload API 可用、首屏导航存在且 Settings 能显示预期 `ORBIT_HOME`；另用 `/tmp/orbit-recommendation-ui-import` 安全 Codex JSONL 在临时库验证真实导入链路，生成 3 events / 2 Activity / 2 Knowledge / 2 Recommendations，其中包含 Today 可处理的 follow-up Recommendation。Computer Use 仍受多个 `dev.orbit.local` Orbit.app 串台影响，无法稳定锁定当前 worktree 窗口，这继续归入正式 app identity / Diagnostics 阶段。
- 2026-05-28 已收敛：Activity 详情页的派生产物不再只是静态列表；linked Knowledge 可直接“在知识中打开”，linked Recommendation 可直接“处理建议”，复用现有 focus 机制进入对应审阅/建议工作台，补齐证据页到归纳/建议闭环的跳转。
- 2026-05-28 checkpoint 验收：`pnpm typecheck`、`pnpm test`（47 files / 249 tests）、`pnpm lint`、`pnpm --filter @orbit/desktop build`、`pnpm --filter @orbit/desktop package:dir`、`pnpm --filter @orbit/desktop package:smoke -- --app release/mac-arm64/Orbit.app --orbit-home /tmp/orbit-package-smoke-activity-derived` 均已通过；package smoke 未发现 `.db` / `.sqlite` / `.jsonl` / autoresearch / `research-results.tsv` / `fixtures` / `.tmp` / `perception-sidecars` 混入 `apps/desktop/release/mac-arm64/Orbit.app`。
- 2026-05-28 已收敛：新增四份第二轮强化 spec，覆盖 Activity 最新捕获/导入证据高亮、Knowledge / Review Queue 队列式反馈、Recommendation 动作反馈和合并证据提示、真实来源自助导入格式说明；作为后续继续推进普通用户自助使用的产品化依据。
- 2026-05-28 已收敛：Activity focus token 现在保留本次捕获/导入的 eventIds 和 sourceAdapterIds，Activity 到达目标 session 后会显示本次定位事件/来源数量，并在事件流和证据列表中高亮本次新增证据，减少用户进入 session 后继续猜“哪条是刚生成的”的成本。
- 2026-05-28 已收敛：Review Queue 增加待审阅 Knowledge / Memory 计数和本地动作反馈；确认、拒绝、归档后会记录最近动作并收起该项证据展开，强化“审阅队列”而不是静态列表的操作感。
- 2026-05-28 已收敛：Recommendations 页面增加本地生命周期动作反馈，接受、稍后提醒、忽略和标记解决后明确提示只更新本地审阅状态；当一条建议包含多条证据时显示重复信号已合并，降低真实来源增加后建议噪音感。
- 2026-05-28 已收敛：Sources 显式导入增加 source-kind-specific 自助说明，区分文件/文件夹路径，并为浏览器、终端、文件活动导入展示已脱敏 JSON 示例；项目目录说明明确只读路径、mtime、git 元数据和 hash，不默认读取文件正文。
- 2026-05-28 checkpoint 验收：`pnpm typecheck`、`pnpm test`（48 files / 252 tests）、`pnpm lint`、`pnpm --filter @orbit/desktop build`、`pnpm --filter @orbit/desktop package:dir`、`pnpm --filter @orbit/desktop package:smoke -- --app release/mac-arm64/Orbit.app --orbit-home /tmp/orbit-package-smoke-v2-usability` 均已通过；package smoke 和 release 内容扫描未发现 `.db` / `.sqlite` / `.jsonl` / autoresearch / `research-results.tsv` / `fixtures` / `.tmp` / `perception-sidecars` 混入 `apps/desktop/release/mac-arm64/Orbit.app`。
- 2026-05-28 已收敛：Handoff evidence index 不再只是静态 source pointer；每条证据会显示来源对象类型、对象 ID 和来源策略，并能从 Handoff 直接跳回 Activity session、Knowledge artifact 或 Recommendation workbench，补齐交接包到原始证据/审阅对象的反向追溯。
- 2026-05-28 checkpoint 验收：`pnpm typecheck`、`pnpm test`（48 files / 253 tests）、`pnpm lint`、`pnpm --filter @orbit/desktop build`、`pnpm --filter @orbit/desktop package:dir`、`pnpm --filter @orbit/desktop package:smoke -- --app release/mac-arm64/Orbit.app --orbit-home /tmp/orbit-package-smoke-handoff-evidence` 均已通过；package smoke 和 release 内容扫描未发现 `.db` / `.sqlite` / `.jsonl` / autoresearch / `research-results.tsv` / `fixtures` / `.tmp` / `perception-sidecars` 混入 `apps/desktop/release/mac-arm64/Orbit.app`。
- 2026-05-28 已收敛：Knowledge 详情里的来源 Activity Session 增加“打开活动”动作，可从审阅工作台直接跳回原始 Activity evidence detail；Review / Knowledge 审阅结论到现场证据的反向追溯不再需要用户手动复制 session ID 或回历史列表查找。
- 2026-05-28 checkpoint 验收：`pnpm typecheck`、`pnpm test`（48 files / 253 tests）、`pnpm lint`、`pnpm --filter @orbit/desktop build`、`pnpm --filter @orbit/desktop package:dir`、`pnpm --filter @orbit/desktop package:smoke -- --app release/mac-arm64/Orbit.app --orbit-home /tmp/orbit-package-smoke-knowledge-source-session` 均已通过；package smoke 和 release 内容扫描未发现 `.db` / `.sqlite` / `.jsonl` / autoresearch / `research-results.tsv` / `fixtures` / `.tmp` / `perception-sidecars` 混入 `apps/desktop/release/mac-arm64/Orbit.app`。
- 仍需正式解决 packaged app 多 worktree 串台：当前 `dev.orbit.local` bundle id 和 `~/Library/Application Support/Orbit` user-data-dir 会让 Computer Use / macOS 复用旧 Orbit 实例，手动验收必须先核对进程环境中的 `ORBIT_HOME`，并清理旧进程；后续正式 app identity / dev identity 隔离应作为安装启动阶段处理。
- 仍需收敛手动验收数据目录：本次 release app 因既有 Settings 存储路径连接到 `/tmp/orbit-manual-open/orbit.db`，而不是默认 `~/Library/Application Support/Orbit/orbit.db`；后续 Diagnostics/About 页面应直接展示当前 `orbitHome`、`dbPath`、日志路径、权限状态和最近错误，避免普通用户或验收人员误判数据来源。

## 发布前待办

- 明确 Alpha 数据边界和默认关闭项。
- 完成 macOS 权限引导、菜单栏状态、暂停/停止/清理入口。
- 完成本地数据库迁移兼容与备份恢复策略。
- 完成 AI provider 配置、任务级策略、失败降级和审计。
- 完成基础性能预算：采样频率、CPU、存储、队列深度和 provider 调用预算。
- 完成用户可理解的删除、导出、审阅和错误恢复路径。
