import { createContext, useContext } from "react";
import type { ReactElement, ReactNode } from "react";
import type { DesktopLanguage } from "./orbitApi";

export type EffectiveLanguage = "en" | "zh-CN";

const translations = {
  en: {
    "app.brandSubtitle": "Local context system",
    "app.localOnly": "Local only",
    "app.remoteEnabled": "Remote enabled",
    "app.loading": "Loading",
    "app.loadingContext": "Loading local context",
    "app.refresh": "Refresh",
    "aria.views": "Orbit views",
    "nav.today": "Today",
    "nav.activity": "Activity",
    "nav.knowledge": "Knowledge",
    "nav.memory": "Memory",
    "nav.recommendations": "Recommendations",
    "nav.review": "Review Queue",
    "nav.sources": "Sources",
    "nav.settings": "Settings",
    "error.load": "Unable to load Orbit data",
    "error.setting": "Unable to update setting",
    "error.source": "Unable to configure source",
    "error.reindex": "Unable to re-index local data",
    "error.clear": "Unable to clear local data",
    "error.export": "Unable to export context",
    "error.knowledgeReview": "Unable to update knowledge review state",
    "error.memoryReview": "Unable to update memory review state",
    "error.recommendationReview": "Unable to update recommendation state",
    "metric.events": "Events",
    "metric.activity": "Activity",
    "metric.knowledge": "Knowledge",
    "metric.recommendations": "Recommendations",
    "metric.sources": "Sources",
    "metric.localDb": "Local DB",
    "detail.normalized": "normalized",
    "detail.today": "today",
    "detail.drafts": "drafts",
    "detail.open": "open",
    "detail.walEnabled": "WAL enabled",
    "section.recentActivity": "Recent Activity",
    "section.recommendations": "Recommendations",
    "section.activityTimeline": "Activity Timeline",
    "section.knowledgeArtifacts": "Knowledge Artifacts",
    "section.memoryStore": "Memory Store",
    "section.knowledgeDrafts": "Knowledge Drafts",
    "section.memoryCandidates": "Memory Candidates",
    "section.sourceStatus": "Source Status",
    "section.sourceSetup": "Source Setup",
    "section.firstRunSourceSetup": "First-run Source Setup",
    "section.runtime": "Runtime",
    "section.databasePath": "Database Path",
    "section.dataOperations": "Data Operations",
    "section.aiVisual": "AI And Visual Context",
    "empty.noActivityForDate": "No activity for this date",
    "empty.noRecommendations": "No recommendations",
    "empty.noActivitySessions": "No activity sessions",
    "empty.noKnowledgeArtifacts": "No knowledge artifacts",
    "empty.noMemories": "No memories",
    "empty.noKnowledgeDrafts": "No knowledge drafts",
    "empty.noMemoryCandidates": "No memory candidates",
    "empty.noSources": "No sources configured",
    "fallback.noSummary": "No summary available",
    "fallback.unknownApp": "unknown app",
    "fallback.global": "global",
    "fallback.noEvidence": "No evidence",
    "unit.events": "events",
    "action.accept": "Accept",
    "action.dismiss": "Dismiss",
    "action.snooze": "Snooze",
    "action.resolve": "Resolve",
    "action.confirm": "Confirm",
    "action.reject": "Reject",
    "action.archive": "Archive",
    "action.loadFixtures": "Load Fixtures",
    "action.configureCodex": "Configure Codex",
    "action.configureAgent": "Configure Agent",
    "action.configureSeaTalk": "Configure SeaTalk",
    "action.savePath": "Save Path",
    "action.reindex": "Re-index",
    "action.exportContext": "Export Context",
    "action.clearLocalData": "Clear Local Data",
    "source.fixtures": "Fixtures",
    "source.fixturesDescription": "Load bundled Codex and SeaTalk fixtures for local validation.",
    "source.codexDescription": "Read sanitized Codex sessions from an explicit local path.",
    "source.localAgent": "Local Agent",
    "source.localAgentDescription":
      "Read Claude Code or other local agent sessions through the generic adapter.",
    "source.seatalkImport": "SeaTalk Import",
    "source.seatalkDescription": "Read approved, user-provided SeaTalk import files only.",
    "settings.orbitHome": "Orbit Home",
    "settings.activeDatabase": "Active Database",
    "settings.menuBar": "Menu Bar",
    "settings.launchAtLogin": "Launch At Login",
    "settings.pathNote":
      "Path changes are persisted as a restart boundary. The active connection stays on the current database until the next launch.",
    "settings.aiProvider": "AI Provider",
    "settings.externalActions": "External Actions",
    "settings.visualContext": "Visual Context Input",
    "settings.language": "Language",
    "language.system": "System default",
    "language.english": "English",
    "language.chinese": "Chinese",
    "state.enabled": "enabled",
    "state.disabled": "disabled",
    "sourceKind.codex": "Codex",
    "sourceKind.local_agent": "Local Agent",
    "sourceKind.seatalk": "SeaTalk",
    "memoryKind.project_fact": "project fact",
    "recommendationType.context_needed": "context needed",
    "recommendationType.follow_up": "follow-up",
    "status.draft": "draft",
    "status.needs_review": "needs review",
    "status.confirmed": "confirmed",
    "status.rejected": "rejected",
    "status.archived": "archived",
    "status.new": "new",
    "status.accepted": "accepted",
    "status.dismissed": "dismissed",
    "status.snoozed": "snoozed",
    "status.resolved": "resolved",
    "impact.low": "low",
    "impact.medium": "medium",
    "impact.high": "high",
    "sensitivity.public": "public",
    "sensitivity.internal": "internal",
    "sensitivity.confidential": "confidential",
    "sensitivity.secret": "secret"
  },
  "zh-CN": {
    "app.brandSubtitle": "本地工作上下文系统",
    "app.localOnly": "仅本地",
    "app.remoteEnabled": "远端已启用",
    "app.loading": "加载中",
    "app.loadingContext": "正在加载本地上下文",
    "app.refresh": "刷新",
    "aria.views": "Orbit 视图",
    "nav.today": "今天",
    "nav.activity": "活动",
    "nav.knowledge": "知识",
    "nav.memory": "记忆",
    "nav.recommendations": "建议",
    "nav.review": "审阅队列",
    "nav.sources": "来源",
    "nav.settings": "设置",
    "error.load": "无法加载 Orbit 数据",
    "error.setting": "无法更新设置",
    "error.source": "无法配置来源",
    "error.reindex": "无法重建本地索引",
    "error.clear": "无法清空本地数据",
    "error.export": "无法导出上下文",
    "error.knowledgeReview": "无法更新知识审阅状态",
    "error.memoryReview": "无法更新记忆审阅状态",
    "error.recommendationReview": "无法更新建议状态",
    "metric.events": "事件",
    "metric.activity": "活动",
    "metric.knowledge": "知识",
    "metric.recommendations": "建议",
    "metric.sources": "来源",
    "metric.localDb": "本地数据库",
    "detail.normalized": "已标准化",
    "detail.today": "今天",
    "detail.drafts": "草稿",
    "detail.open": "待处理",
    "detail.walEnabled": "WAL 已启用",
    "section.recentActivity": "最近活动",
    "section.recommendations": "建议",
    "section.activityTimeline": "活动时间线",
    "section.knowledgeArtifacts": "知识文档",
    "section.memoryStore": "记忆库",
    "section.knowledgeDrafts": "知识草稿",
    "section.memoryCandidates": "记忆候选",
    "section.sourceStatus": "来源状态",
    "section.sourceSetup": "来源配置",
    "section.firstRunSourceSetup": "首次来源配置",
    "section.runtime": "运行状态",
    "section.databasePath": "数据库路径",
    "section.dataOperations": "数据操作",
    "section.aiVisual": "AI 与视觉上下文",
    "empty.noActivityForDate": "这一天没有活动",
    "empty.noRecommendations": "暂无建议",
    "empty.noActivitySessions": "暂无活动片段",
    "empty.noKnowledgeArtifacts": "暂无知识文档",
    "empty.noMemories": "暂无记忆",
    "empty.noKnowledgeDrafts": "暂无知识草稿",
    "empty.noMemoryCandidates": "暂无记忆候选",
    "empty.noSources": "尚未配置来源",
    "fallback.noSummary": "暂无摘要",
    "fallback.unknownApp": "未知应用",
    "fallback.global": "全局",
    "fallback.noEvidence": "暂无证据",
    "unit.events": "个事件",
    "action.accept": "接受",
    "action.dismiss": "忽略",
    "action.snooze": "稍后提醒",
    "action.resolve": "标记解决",
    "action.confirm": "确认",
    "action.reject": "拒绝",
    "action.archive": "归档",
    "action.loadFixtures": "加载示例数据",
    "action.configureCodex": "配置 Codex",
    "action.configureAgent": "配置 Agent",
    "action.configureSeaTalk": "配置 SeaTalk",
    "action.savePath": "保存路径",
    "action.reindex": "重建索引",
    "action.exportContext": "导出上下文",
    "action.clearLocalData": "清空本地数据",
    "source.fixtures": "示例数据",
    "source.fixturesDescription": "加载内置 Codex 与 SeaTalk 示例，用于本地验证。",
    "source.codexDescription": "从用户明确提供的本地路径读取已脱敏 Codex 会话。",
    "source.localAgent": "本地 Agent",
    "source.localAgentDescription": "通过通用适配器读取 Claude Code 或其他本地 Agent 会话。",
    "source.seatalkImport": "SeaTalk 导入",
    "source.seatalkDescription": "只读取用户明确提供并批准的 SeaTalk 导入文件。",
    "settings.orbitHome": "Orbit 主目录",
    "settings.activeDatabase": "当前数据库",
    "settings.menuBar": "菜单栏常驻",
    "settings.launchAtLogin": "开机启动",
    "settings.pathNote": "路径变更会作为重启边界保存。当前连接会继续使用现有数据库，直到下次启动。",
    "settings.aiProvider": "AI Provider",
    "settings.externalActions": "外部动作",
    "settings.visualContext": "视觉上下文输入",
    "settings.language": "语言",
    "language.system": "跟随系统",
    "language.english": "English",
    "language.chinese": "中文",
    "state.enabled": "已启用",
    "state.disabled": "已禁用",
    "sourceKind.codex": "Codex",
    "sourceKind.local_agent": "本地 Agent",
    "sourceKind.seatalk": "SeaTalk",
    "memoryKind.project_fact": "项目事实",
    "recommendationType.context_needed": "需要上下文",
    "recommendationType.follow_up": "待跟进",
    "status.draft": "草稿",
    "status.needs_review": "待审阅",
    "status.confirmed": "已确认",
    "status.rejected": "已拒绝",
    "status.archived": "已归档",
    "status.new": "新建议",
    "status.accepted": "已接受",
    "status.dismissed": "已忽略",
    "status.snoozed": "稍后提醒",
    "status.resolved": "已解决",
    "impact.low": "低",
    "impact.medium": "中",
    "impact.high": "高",
    "sensitivity.public": "公开",
    "sensitivity.internal": "内部",
    "sensitivity.confidential": "机密",
    "sensitivity.secret": "秘密"
  }
} as const;

export type TranslationKey = keyof (typeof translations)["en"];

export interface I18nApi {
  language: EffectiveLanguage;
  t(key: TranslationKey): string;
  status(value: string): string;
  impact(value: string): string;
  sensitivity(value: string): string;
  sourceKind(value: string): string;
  memoryKind(value: string): string;
  recommendationType(value: string): string;
  formatDate(value: string): string;
  formatTimeRange(startAt: string, endAt: string): string;
  formatDateTimeRange(startAt: string, endAt: string): string;
}

const fallbackLanguage: EffectiveLanguage = "en";

const I18nContext = createContext<I18nApi>(createI18n(fallbackLanguage));

export function I18nProvider({
  language,
  children
}: {
  language: EffectiveLanguage;
  children: ReactNode;
}): ReactElement {
  return <I18nContext.Provider value={createI18n(language)}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nApi {
  return useContext(I18nContext);
}

export function createI18n(language: EffectiveLanguage): I18nApi {
  const dictionary = translations[language] ?? translations[fallbackLanguage];
  const t = (key: TranslationKey): string => dictionary[key] ?? translations.en[key] ?? key;
  const locale = language === "zh-CN" ? "zh-CN" : "en";
  return {
    language,
    t,
    status: (value) => tValue(t, "status", value),
    impact: (value) => tValue(t, "impact", value),
    sensitivity: (value) => tValue(t, "sensitivity", value),
    sourceKind: (value) => tValue(t, "sourceKind", value),
    memoryKind: (value) => tValue(t, "memoryKind", value),
    recommendationType: (value) => tValue(t, "recommendationType", value),
    formatDate: (value) => formatDateKey(locale, value),
    formatTimeRange: (startAt, endAt) =>
      `${formatTime(locale, startAt)} - ${formatTime(locale, endAt)}`,
    formatDateTimeRange: (startAt, endAt) => formatDateTimeRange(locale, startAt, endAt)
  };
}

export function getEffectiveLanguage(selection: DesktopLanguage | undefined): EffectiveLanguage {
  if (selection === "en" || selection === "zh-CN") {
    return selection;
  }

  const browserLanguages =
    typeof navigator === "undefined" ? [] : [navigator.language, ...navigator.languages];
  return browserLanguages.some((language) => language.toLowerCase().startsWith("zh"))
    ? "zh-CN"
    : "en";
}

function tValue(t: (key: TranslationKey) => string, namespace: string, value: string): string {
  const key = `${namespace}.${value}` as TranslationKey;
  const translated = t(key);
  return translated === key ? humanizeValue(value) : translated;
}

function humanizeValue(value: string): string {
  return value.replaceAll("_", " ");
}

function formatDateKey(locale: string, value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  const [, year, month, day] = match;
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(Number(year), Number(month) - 1, Number(day)));
}

function formatTime(locale: string, value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

function formatDateTime(locale: string, value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

function formatDateTimeRange(locale: string, startAt: string, endAt: string): string {
  const start = new Date(startAt);
  const end = new Date(endAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return `${startAt} - ${endAt}`;
  }

  if (
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth() &&
    start.getDate() === end.getDate()
  ) {
    return `${formatDateTime(locale, startAt)} - ${formatTime(locale, endAt)}`;
  }
  return `${formatDateTime(locale, startAt)} - ${formatDateTime(locale, endAt)}`;
}
