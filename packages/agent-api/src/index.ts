import { formatHandoffMarkdown, type HandoffExclusionReason, type HandoffPack } from "@orbit/core";
import { buildProjectHandoffPack, buildTodayHandoffPack, openOrbitDatabase } from "@orbit/db";

export interface AgentApiStatus {
  readonly ready: boolean;
}

export const agentApiStatus: AgentApiStatus = {
  ready: true
};

export interface AgentHandoffResourceDescriptor {
  uri: string;
  mimeType: "text/markdown";
  readOnly: true;
}

export interface ReadAgentHandoffResourceOptions {
  orbitHome?: string;
  date?: string;
  generatedAt?: string;
}

export interface AgentHandoffResource {
  descriptor: AgentHandoffResourceDescriptor;
  content: string;
  readyForAgent: boolean;
  included: {
    activity: number;
    knowledge: number;
    memory: number;
    recommendations: number;
    evidence: number;
  };
  excluded: {
    total: number;
    byReason: Partial<Record<HandoffExclusionReason, number>>;
  };
  handoff: HandoffPack;
}

export function buildAgentHandoffResource(
  input: "today" | { kind: "project"; project: string }
): AgentHandoffResourceDescriptor {
  if (input === "today") {
    return {
      uri: "orbit://handoff/today",
      mimeType: "text/markdown",
      readOnly: true
    };
  }
  return {
    uri: `orbit://handoff/project/${encodeURIComponent(input.project)}`,
    mimeType: "text/markdown",
    readOnly: true
  };
}

export function readAgentHandoffResource(
  input: "today" | { kind: "project"; project: string },
  options: ReadAgentHandoffResourceOptions = {}
): AgentHandoffResource {
  const database = openOrbitDatabase(omitUndefined({ orbitHome: options.orbitHome }));
  try {
    const handoff =
      input === "today"
        ? buildTodayHandoffPack(
            database,
            omitUndefined({ date: options.date, generatedAt: options.generatedAt })
          )
        : buildProjectHandoffPack(
            database,
            input.project,
            omitUndefined({ generatedAt: options.generatedAt })
          );
    return {
      descriptor: buildAgentHandoffResource(input),
      content: formatHandoffMarkdown(handoff),
      readyForAgent:
        handoff.recentActivity.length > 0 &&
        handoff.confirmedKnowledge.length > 0 &&
        handoff.activeMemories.length > 0,
      included: {
        activity: handoff.recentActivity.length,
        knowledge: handoff.confirmedKnowledge.length,
        memory: handoff.activeMemories.length,
        recommendations: handoff.recommendedNextActions.length,
        evidence: handoff.evidenceIndex.length
      },
      excluded: {
        total: handoff.excluded.length,
        byReason: countExcludedByReason(handoff.excluded)
      },
      handoff
    };
  } finally {
    database.close();
  }
}

function countExcludedByReason(
  excluded: Array<{ reason: HandoffExclusionReason }>
): Partial<Record<HandoffExclusionReason, number>> {
  const counts: Partial<Record<HandoffExclusionReason, number>> = {};
  for (const item of excluded) {
    counts[item.reason] = (counts[item.reason] ?? 0) + 1;
  }
  return counts;
}

function omitUndefined<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== undefined)
  ) as Partial<T>;
}
