# Codex Goal 模式启动说明

日期：2026-05-24

本文用于开启新的 Codex goal 模式线程。目标是让 Orbit 围绕 [当前目标：产品可用](current-goal.md) 进行长跑式推进，避免新线程只做零散优化或偏离产品闭环。

## 新线程启动 Prompt

可以把下面这段直接贴到新的 Codex goal 模式线程：

```text
开启 Codex goal 模式。请先阅读 AGENTS.md、docs/current-goal.md、docs/goal-mode-launch.md、docs/product.md、docs/todo.md，以及 assets/product-vision/*.png 对应的目标产品图。

目标：围绕 docs/current-goal.md，把 Orbit 从“工程骨架可运行”推进到“产品可用”。第一阶段只聚焦首批闭环：

1. Today 产品化首页：真实活动、来源状态、知识草稿、建议和下一步行动能一屏扫读。
2. Activity 证据浏览：时间线、证据索引、事件流、来源策略和原始数据状态能互相跳转。
3. Knowledge / Review 审阅工作台：总结内容、Markdown 预览、证据、确认/拒绝/归档形成闭环。
4. Handoff 交接包：Today/Project 范围、安全边界、包含/排除理由、Markdown/JSON 预览完整可见。

优先级：真实端到端工作流 > 扫读效率 > 证据可追溯 > 审阅/交接闭环 > 静态视觉美化。

允许改动范围：apps/desktop/src/**、apps/desktop/electron/**、packages/**、docs/current-goal.md、docs/todo.md、docs/goal-mode-launch.md。必要时可以补测试和安全样例数据，但不得提交本地私密数据、raw screen/audio/OCR payload、运行产物、打包产物或 autoresearch 运行 artifacts。

安全边界：不得默认开启持续录屏、麦克风、任意文件扫描、silent browser scraping、外部副作用、raw 私密导出、未确认 Knowledge/Memory 导出或不可导出来源进入 Handoff。任何高风险来源必须显式授权、可见运行、可暂停、短保留、可清理。

验收：每个保留 checkpoint 都必须至少运行并记录：
- pnpm typecheck
- pnpm test
- pnpm lint
- pnpm --filter @orbit/desktop build

如果改动涉及打包或桌面运行，还要运行：
- pnpm --filter @orbit/desktop package:dir

人工验收：尽量用最新打包出的 apps/desktop/release/mac-arm64/Orbit.app 走通 Today -> Activity -> Knowledge/Review -> Handoff，并对照 assets/product-vision 记录剩余差距。

Checkpoint 规则：每个自洽、验收通过、没有混入无关改动的阶段，都创建语义清晰的 commit 并 push 当前远端分支。不要把失败实验、运行日志、autoresearch-state.json、research-results.tsv、临时截图或私密数据提交。

运行方式：建议先 foreground 跑一小轮确认方向；如果要长时间 unattended，再切 background。启动前请先给出你理解的目标、范围、机械指标、验收命令和第一个 checkpoint 计划，等我确认后再 go。
```

## 第一阶段成功标准

第一阶段不要求一次性完成所有产品愿景，但至少应让最新 desktop app 具备可 dogfood 的主路径：

- Today：用户能在首屏理解今天的活动、知识草稿、建议、来源状态和下一步动作。
- Activity：用户能从一个活动进入详情，看到时间线、事件流、证据指针、来源策略和存储状态。
- Knowledge / Review：用户能从草稿列表进入详情，审阅摘要、关键洞察、Markdown 预览和证据，并执行确认/拒绝/归档。
- Handoff：用户能生成 Today 或 Project 交接包，看到包含内容、排除内容、排除理由、安全边界和 Markdown/JSON 预览。
- Sources / Settings：至少不阻断主流程，并能清楚表达来源权限、AI 使用、raw 存储和 Agent 导出边界。

## 推荐机械指标

Goal 模式需要可验证指标。产品可用很难只靠一个数字判断，因此本项目采用“命令验收 + 手动流程验收 + 差距记录”的组合：

- 基础命令验收：`pnpm typecheck && pnpm test && pnpm lint && pnpm --filter @orbit/desktop build`
- 桌面产物验收：`pnpm --filter @orbit/desktop package:dir`
- 手动流程验收：打开最新 `Orbit.app`，走通 Today -> Activity -> Knowledge/Review -> Handoff。
- 产品差距记录：每个 checkpoint 更新 `docs/todo.md` 或相关文档，记录对 `assets/product-vision` 的剩余差距。

如果需要一个单一循环指标，优先使用“首批闭环验收清单完成项数量”，方向为增加。不要用纯视觉相似度作为唯一指标。

## 不要做

- 不要为了追图而牺牲本地优先、隐私边界和可追溯性。
- 不要默认启用高风险采集能力。
- 不要把 fixture 演示当作真实产品可用。
- 不要把所有页面同时大改成不可验收的大 diff。
- 不要提交 `research-results.tsv`、`autoresearch-state.json`、`autoresearch-launch.json`、`autoresearch-runtime.json`、`autoresearch-runtime.log`。
- 不要提交 `apps/desktop/release/**`、`.tmp/**`、私密截图、OCR 原文、音频、转写原文或本地数据库。

## 建议迭代顺序

1. 建立首批闭环验收清单和页面差距清单。
2. 优先 Today，把首页从调试摘要推进到可扫读的今日工作台。
3. 改 Activity 证据浏览，让用户能从摘要跳回证据和来源策略。
4. 改 Knowledge / Review，把审阅体验从长元数据面板推进到工作台。
5. 改 Handoff，补包含/排除、安全边界、Markdown/JSON 预览。
6. 再收敛 Memory、Sources、Settings 的治理体验。

