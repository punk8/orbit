import { explainHandoffExclusion } from "./handoffPack";
import type {
  HandoffActivityItem,
  HandoffDecisionItem,
  HandoffEvidenceItem,
  HandoffKnowledgeItem,
  HandoffMemoryItem,
  HandoffNextStepItem,
  HandoffPack,
  HandoffProgressItem,
  HandoffRecommendationItem,
  HandoffRiskItem,
  HandoffSafetyBoundary
} from "./handoffPack";

export interface FormatHandoffMarkdownOptions {
  language?: "en" | "zh-CN";
}

export function formatHandoffMarkdown(
  pack: HandoffPack,
  options: FormatHandoffMarkdownOptions = {}
): string {
  const labels = options.language === "zh-CN" ? zhLabels : enLabels;
  return [
    labels.title,
    "",
    labels.objective,
    pack.objective,
    "",
    labels.currentState,
    formatCurrentState(pack, options.language === "zh-CN"),
    "",
    labels.completedOrAttempted,
    formatProgress(pack.completedOrAttempted, options.language === "zh-CN"),
    "",
    labels.recentActivity,
    formatActivity(pack.recentActivity),
    "",
    labels.confirmedKnowledge,
    formatKnowledge(pack.confirmedKnowledge),
    "",
    labels.activeMemories,
    formatMemories(pack.activeMemories),
    "",
    labels.decisions,
    formatDecisions(pack.decisions),
    "",
    labels.blockersAndRisks,
    formatRisks(pack.blockersAndRisks, options.language === "zh-CN"),
    "",
    labels.recommendedNextActions,
    formatRecommendations(pack.recommendedNextActions, options.language === "zh-CN"),
    "",
    labels.nextSteps,
    formatNextSteps(pack.nextSteps, options.language === "zh-CN"),
    "",
    labels.safetyBoundaries,
    formatSafety(pack.safetyBoundaries, options.language === "zh-CN"),
    "",
    labels.evidenceIndex,
    formatEvidence(pack.evidenceIndex),
    "",
    labels.excluded,
    formatExclusions(pack.excluded, options.language === "zh-CN")
  ].join("\n");
}

const enLabels = {
  title: "# Orbit Handoff",
  objective: "## Objective",
  currentState: "## Current State",
  completedOrAttempted: "## Completed / Attempted",
  recentActivity: "## Recent Activity",
  confirmedKnowledge: "## Confirmed Knowledge",
  activeMemories: "## Active Memories",
  decisions: "## Decisions",
  blockersAndRisks: "## Blockers And Risks",
  recommendedNextActions: "## Recommended Next Actions",
  nextSteps: "## Next Steps",
  safetyBoundaries: "## Safety Boundaries",
  evidenceIndex: "## Evidence Index",
  excluded: "## Excluded From Handoff"
};

const zhLabels = {
  title: "# Orbit 交班包",
  objective: "## 目标",
  currentState: "## 当前状态",
  completedOrAttempted: "## 已完成 / 已尝试",
  recentActivity: "## 最近活动",
  confirmedKnowledge: "## 已确认知识",
  activeMemories: "## 生效记忆",
  decisions: "## 决策",
  blockersAndRisks: "## 阻塞与风险",
  recommendedNextActions: "## 建议行动",
  nextSteps: "## 建议下一步",
  safetyBoundaries: "## 安全边界",
  evidenceIndex: "## 证据索引",
  excluded: "## 未进入交班的内容"
};

function formatActivity(items: HandoffActivityItem[]): string {
  if (items.length === 0) return "- None";
  return items
    .map(
      (item) =>
        `- ${item.title} (${item.startAt} - ${item.endAt})${item.summary ? `: ${item.summary}` : ""}`
    )
    .join("\n");
}

function formatCurrentState(pack: HandoffPack, zh: boolean): string {
  if (!zh) return formatList(pack.currentState);
  return [
    `- 当前目标：${pack.objective}`,
    `- 可交给 Agent 的最近活动：${pack.recentActivity.length}`,
    `- 已确认知识：${pack.confirmedKnowledge.length}`,
    `- 已确认记忆：${pack.activeMemories.length}`,
    `- 未关闭建议：${pack.recommendedNextActions.length}`,
    `- 阻塞或风险：${pack.blockersAndRisks.length}`,
    `- 可追溯证据指针：${pack.evidenceIndex.length}`,
    `- 已排除且带原因的内容：${pack.excluded.length}`
  ].join("\n");
}

function formatKnowledge(items: HandoffKnowledgeItem[]): string {
  if (items.length === 0) return "- None";
  return items
    .map((item) => `- ${item.title}: ${item.description}${formatEvidenceSuffix(item.evidenceIds)}`)
    .join("\n");
}

function formatMemories(items: HandoffMemoryItem[]): string {
  if (items.length === 0) return "- None";
  return items
    .map((item) => `- ${item.title}: ${item.body}${formatEvidenceSuffix(item.evidenceIds)}`)
    .join("\n");
}

function formatProgress(items: HandoffProgressItem[], zh: boolean): string {
  if (items.length === 0) return "- None";
  return items
    .map(
      (item) =>
        `- ${item.title} (${formatProgressStatus(item.status, zh)})${formatEvidenceSuffix(item.evidenceIds)}`
    )
    .join("\n");
}

function formatDecisions(items: HandoffDecisionItem[]): string {
  if (items.length === 0) return "- None";
  return items
    .map((item) => `- ${item.title}${formatEvidenceSuffix(item.evidenceIds)}`)
    .join("\n");
}

function formatRisks(items: HandoffRiskItem[], zh: boolean): string {
  if (items.length === 0) return "- None";
  return items
    .map((item) => {
      const action = item.suggestedAction
        ? ` ${zh ? "建议动作" : "Action"}: ${item.suggestedAction}`
        : "";
      return `- ${item.title}${action}${formatEvidenceSuffix(item.evidenceIds)}`;
    })
    .join("\n");
}

function formatNextSteps(items: HandoffNextStepItem[], zh: boolean): string {
  if (items.length === 0) return "- None";
  return items
    .map(
      (item) =>
        `- ${item.title}: ${item.action} (${item.impact}, ${zh ? "置信度" : "confidence"} ${item.confidence})${formatEvidenceSuffix(item.evidenceIds)}`
    )
    .join("\n");
}

function formatRecommendations(items: HandoffRecommendationItem[], zh: boolean): string {
  if (items.length === 0) return "- None";
  return items
    .map(
      (item) =>
        `- ${item.title}: ${item.suggestedAction} (${item.impact}, ${zh ? "置信度" : "confidence"} ${item.confidence})${formatEvidenceSuffix(item.evidenceIds)}`
    )
    .join("\n");
}

function formatSafety(items: HandoffSafetyBoundary[], zh: boolean): string {
  return items
    .map((item) => {
      const translated = zh ? translateSafetyBoundary(item) : item;
      return `- ${translated.title}: ${translated.description}`;
    })
    .join("\n");
}

function formatEvidence(items: HandoffEvidenceItem[]): string {
  if (items.length === 0) return "- None";
  return items
    .map((item) => `- ${item.id}: ${item.sourceKind} ${item.sourcePointer} (${item.timestamp})`)
    .join("\n");
}

function formatExclusions(items: HandoffPack["excluded"], zh: boolean): string {
  if (items.length === 0) return "- None";
  return items
    .map((item) => {
      const explanation = explainHandoffExclusion(item.reason);
      if (!zh) {
        return `- ${item.objectType} ${item.objectId}: ${explanation.title}. ${explanation.description} Next: ${explanation.nextAction}`;
      }
      const translated = translateExclusion(item.reason);
      return `- ${item.objectType} ${item.objectId}: ${translated.title}。${translated.description} 下一步：${translated.nextAction}`;
    })
    .join("\n");
}

function formatList(items: string[]): string {
  if (items.length === 0) return "- None";
  return items.map((item) => `- ${item}`).join("\n");
}

function formatEvidenceSuffix(evidenceIds: string[]): string {
  return evidenceIds.length > 0 ? ` [${evidenceIds.join(", ")}]` : "";
}

function formatProgressStatus(status: HandoffProgressItem["status"], zh: boolean): string {
  if (!zh) return status;
  return status === "completed" ? "已完成" : "已尝试";
}

function translateSafetyBoundary(item: HandoffSafetyBoundary): HandoffSafetyBoundary {
  if (item.kind === "review_required") {
    return {
      ...item,
      title: "用户审阅后再分享",
      description: "交给其他 Agent 前，请先审阅这份交班包。"
    };
  }
  if (item.kind === "no_side_effects") {
    return {
      ...item,
      title: "不执行副作用",
      description: "这份交班包只建议下一步，不会发送消息、建任务或修改外部系统。"
    };
  }
  if (item.kind === "no_raw_payloads") {
    return {
      ...item,
      title: "不包含原始载荷",
      description: "默认排除原始事件文本、截图、录屏、音频和转写全文。"
    };
  }
  if (item.kind === "source_export_policy") {
    return {
      ...item,
      title: "遵守来源导出策略",
      description: "禁止导出给 Agent 的来源会被排除。"
    };
  }
  return {
    ...item,
    title: "仅本地生成",
    description: "生成交班包不会把内容发送到外部服务。"
  };
}

function translateExclusion(reason: HandoffPack["excluded"][number]["reason"]): {
  title: string;
  description: string;
  nextAction: string;
} {
  if (reason === "draft_knowledge") {
    return {
      title: "知识仍需审阅",
      description: "草稿或待审阅 Knowledge 不会被当作 Agent 可直接接手的上下文",
      nextAction: "审阅、必要时编辑，然后确认这条 Knowledge"
    };
  }
  if (reason === "memory_not_confirmed") {
    return {
      title: "记忆尚未确认",
      description: "候选、已拒绝或已归档 Memory 默认不进入 Agent 上下文",
      nextAction: "如果这条候选记忆稳定且有长期价值，请确认它"
    };
  }
  if (reason === "recommendation_terminal") {
    return {
      title: "建议已关闭",
      description: "已忽略或已解决的 Recommendation 不会继续交给下一个 Agent",
      nextAction: "只有仍需跟进时，才重新打开或创建新的 Recommendation"
    };
  }
  if (reason === "missing_evidence") {
    return {
      title: "缺少证据",
      description: "Orbit 无法为该对象附上可追溯来源指针",
      nextAction: "重建流水线，或先检查来源事件"
    };
  }
  if (reason === "secret_content") {
    return {
      title: "检测到 secret 内容",
      description: "secret 级证据默认禁止进入 Handoff",
      nextAction: "删除或脱敏 secret 内容后，再重新生成上下文"
    };
  }
  if (reason === "failed_redaction") {
    return {
      title: "脱敏失败",
      description: "脱敏失败证据不会进入需要保存或导出的上下文",
      nextAction: "修复来源数据或脱敏结果后再允许导出"
    };
  }
  if (reason === "raw_payload_excluded") {
    return {
      title: "原始载荷已排除",
      description: "默认 Handoff 只保留摘要和来源指针，不包含截图、OCR 原文、录音或转写全文",
      nextAction: "只有在审阅保留、脱敏和来源策略后，才使用显式导出流程"
    };
  }
  if (reason === "private_payload_excluded") {
    return {
      title: "私密载荷已排除",
      description: "即使来源指针可导出，疑似私密的证据片段也会被剔除",
      nextAction: "如果确实需要该细节，请在本地 Activity 中审阅"
    };
  }
  return {
    title: "来源禁止导出",
    description: "该来源策略不允许把这条证据导出给 Agent",
    nextAction: "确认范围安全后，再为该来源开启 Agent 导出"
  };
}
