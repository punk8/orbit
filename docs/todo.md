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
- CLI 导入后的 Codex/local source 不应在 UI 中表现为后台采集错误；如果没有可持续 adapter path，应标记为“显式导入 / import-only”，或持久化已授权导入路径，避免误导用户需要修复后台来源。
- 仍需要一条真实同日 dogfood 验收路径，避免 mock Screen/OCR 固定日期或旧临时库导致 Today 空态或跨日误判。

## 发布前待办

- 明确 Alpha 数据边界和默认关闭项。
- 完成 macOS 权限引导、菜单栏状态、暂停/停止/清理入口。
- 完成本地数据库迁移兼容与备份恢复策略。
- 完成 AI provider 配置、任务级策略、失败降级和审计。
- 完成基础性能预算：采样频率、CPU、存储、队列深度和 provider 调用预算。
- 完成用户可理解的删除、导出、审阅和错误恢复路径。
