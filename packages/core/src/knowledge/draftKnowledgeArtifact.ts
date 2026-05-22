import type { ActivitySession, Event, FollowUp, KnowledgeArtifact } from "../index";
import { createStableId } from "../id";
import {
  buildPerceptionEvidencePacket,
  isPerceptionSource
} from "../perception/perceptionEvidencePacket";

export interface KnowledgeDraftInput {
  session: ActivitySession;
  events: Event[];
  generatedBy?: string;
  language?: "en" | "zh-CN";
}

export function draftKnowledgeArtifact(input: KnowledgeDraftInput): KnowledgeArtifact {
  const { session, events } = input;
  const language = input.language ?? "en";
  const zh = language === "zh-CN";
  const title = zh ? `知识：${session.title}` : `Knowledge: ${session.title}`;
  const safeEvents = events.filter(isSafeKnowledgeEvent);
  const safeEvidence = evidenceForEvents(session, safeEvents);
  const perceptionPacket = session.sourceKinds.some(isPerceptionSource)
    ? buildPerceptionEvidencePacket({ session, events })
    : undefined;
  const keyInsights = buildKeyInsights(safeEvents, zh, perceptionPacket);
  const followUps = buildFollowUps(safeEvents, safeEvidence);
  const evidenceSummary = buildEvidenceSummary(safeEvents, zh, perceptionPacket);
  const description =
    session.summary ??
    (zh ? "根据来源事件生成的本地 Activity 摘要。" : "Synthetic activity summary generated from source events.");
  const markdown = buildMarkdown({
    title,
    session,
    description,
    keyInsights,
    followUps,
    evidenceSummary,
    zh,
    perceptionPacket
  });

  const artifact: KnowledgeArtifact = {
    id: createStableId("knowledge", { sessionId: session.id, type: "daily_brief" }),
    schemaVersion: 1,
    type: "daily_brief",
    title,
    status: "draft",
    metadata: {
      timeWindow: {
        startAt: session.startAt,
        endAt: session.endAt
      },
      apps: session.apps,
      projects: session.project ? [session.project] : [],
      sourceSessionIds: [session.id],
      generatedBy: input.generatedBy ?? "deterministic_local",
      language
    },
    content: {
      description,
      keyInsights,
      followUps,
      markdown
    },
    evidence: safeEvidence,
    confidence: 0.75,
    createdAt: session.updatedAt,
    updatedAt: session.updatedAt
  };

  return artifact;
}

function buildKeyInsights(
  events: Event[],
  zh: boolean,
  perceptionPacket: ReturnType<typeof buildPerceptionEvidencePacket> | undefined
): string[] {
  const packetInsights = perceptionPacket
    ? [
        zh
          ? `该 Activity 包含 ${perceptionPacket.frameCount} 个屏幕帧、${perceptionPacket.selectedOcrSnippets.length} 条已脱敏 OCR 摘要。`
          : `This Activity includes ${perceptionPacket.frameCount} screen frames and ${perceptionPacket.selectedOcrSnippets.length} redacted OCR summaries.`
      ]
    : [];
  const insights = events
    .map((event) => event.content.summary ?? event.content.title ?? event.content.text)
    .filter((value): value is string => Boolean(value))
    .slice(0, 5);
  if (insights.length > 0) return [...packetInsights, ...insights].slice(0, 5);
  return packetInsights.length > 0
    ? packetInsights
    : [
        zh
          ? "这段 Activity 暂时没有提取出可长期复用的稳定洞察。"
          : "No durable insight extracted from this session yet."
      ];
}

function buildFollowUps(events: Event[], evidence: ActivitySession["evidence"]): FollowUp[] {
  return events
    .flatMap((event) => {
      const title = followUpTitle(event);
      if (!title) return [];
      return [
        {
          id: createStableId("followup", { eventId: event.id, title }),
          title,
          status: "open" as const,
          evidence: evidence.filter((ref) => ref.eventId === event.id)
        }
      ];
    })
    .filter((item) => item.evidence.length > 0);
}

function followUpTitle(event: Event): string | undefined {
  if (event.type === "todo") return event.content.title ?? event.content.text ?? "Follow up";
  if (!isPerceptionSource(event.source.kind)) return undefined;
  const text = event.content.summary ?? event.content.text ?? event.content.title ?? "";
  if (!/(?:\b(follow up|action item|next)\b|待跟进|后续|下一步|行动项)/i.test(text)) {
    return undefined;
  }
  return truncateForKnowledge(text, 160);
}

function buildEvidenceSummary(
  events: Event[],
  zh: boolean,
  perceptionPacket: ReturnType<typeof buildPerceptionEvidencePacket> | undefined
): string[] {
  const items = events.slice(0, 8).map((event) => {
    const pointer = event.source.pointer;
    const source = event.source.kind;
    const sensitivity = event.privacy.sensitivity;
    const redaction = event.privacy.redactionState;
    return `${source} ${pointer} (${sensitivity}, redaction=${redaction})`;
  });
  if (perceptionPacket) {
    items.unshift(
      zh
        ? `perception packet ${perceptionPacket.activitySessionId} (frames=${perceptionPacket.frameCount}, nonDuplicate=${perceptionPacket.nonDuplicateFrameCount}, exportEligible=${perceptionPacket.privacy.exportEligible})`
        : `perception packet ${perceptionPacket.activitySessionId} (frames=${perceptionPacket.frameCount}, nonDuplicate=${perceptionPacket.nonDuplicateFrameCount}, exportEligible=${perceptionPacket.privacy.exportEligible})`
    );
  }
  return items.length > 0 ? items : [zh ? "没有关联来源证据。" : "No source evidence linked."];
}

function evidenceForEvents(session: ActivitySession, events: Event[]): ActivitySession["evidence"] {
  const safeEventIds = new Set(events.map((event) => event.id));
  return session.evidence.filter((ref) => ref.eventId && safeEventIds.has(ref.eventId));
}

function isSafeKnowledgeEvent(event: Event): boolean {
  return event.privacy.sensitivity !== "secret" && event.privacy.redactionState !== "failed";
}

function truncateForKnowledge(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function buildMarkdown(input: {
  title: string;
  session: ActivitySession;
  description: string;
  keyInsights: string[];
  followUps: FollowUp[];
  evidenceSummary: string[];
  zh: boolean;
  perceptionPacket: ReturnType<typeof buildPerceptionEvidencePacket> | undefined;
}): string {
  if (!input.zh) {
    return [
      `# ${input.title}`,
      "",
      `Time: ${input.session.startAt} - ${input.session.endAt}`,
      `Project: ${input.session.project ?? "unknown"}`,
      "",
      "## Description",
      input.description,
      "",
      "## Key Insights",
      ...input.keyInsights.map((insight) => `- ${insight}`),
      "",
      "## Evidence",
      ...input.evidenceSummary.map((item) => `- ${item}`),
      "",
      "## Follow Ups",
      ...(input.followUps.length > 0 ? input.followUps.map((item) => `- ${item.title}`) : ["- None"])
    ].join("\n");
  }

  return [
    `# ${input.title}`,
    "",
    "## 元数据",
    `- 时间：${input.session.startAt} - ${input.session.endAt}`,
    `- 项目：${input.session.project ?? "unknown"}`,
    `- 应用：${input.session.apps.length > 0 ? input.session.apps.join(", ") : "unknown"}`,
    input.perceptionPacket
      ? `- 感知证据：${input.perceptionPacket.frameCount} 帧，${input.perceptionPacket.selectedOcrSnippets.length} 条 OCR 摘要`
      : undefined,
    "",
    "## 描述",
    input.description,
    "",
    "## 关键洞察",
    ...input.keyInsights.map((insight) => `- ${insight}`),
    "",
    "## 决策",
    "- 暂无明确决策。",
    "",
    "## 阻塞",
    "- 暂无明确阻塞。",
    "",
    "## 待跟进",
    ...(input.followUps.length > 0 ? input.followUps.map((item) => `- ${item.title}`) : ["- 暂无"]),
    "",
    "## 来源 Activity Sessions",
    `- ${input.session.id}`,
    "",
    "## 证据",
    ...input.evidenceSummary.map((item) => `- ${item}`)
  ]
    .filter((line): line is string => line !== undefined)
    .join("\n");
}
