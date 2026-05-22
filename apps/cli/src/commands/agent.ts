import {
  buildAgentHandoffResource,
  readAgentHandoffResource,
  type AgentHandoffResource,
  type AgentHandoffResourceDescriptor
} from "@orbit/agent-api";
import type { TodayContext } from "@orbit/core";
import { getCliConfig } from "../config";
import { getTodayContext } from "./readModels";

export interface AgentReadOptions {
  date?: string;
  generatedAt?: string;
}

export interface AgentContextResourceDescriptor {
  uri: "orbit://context/today";
  mimeType: "application/json";
  readOnly: true;
}

export interface AgentTodayContextResource {
  descriptor: AgentContextResourceDescriptor;
  content: string;
  readyForAgent: boolean;
  included: {
    activity: number;
    knowledge: number;
    memory: number;
    recommendations: number;
    evidence: number;
  };
  context: TodayContext;
}

export type AgentResourceDescriptor =
  | AgentHandoffResourceDescriptor
  | AgentContextResourceDescriptor;

export type AgentResource = AgentHandoffResource | AgentTodayContextResource;

export function listAgentResources(): AgentResourceDescriptor[] {
  return [
    buildAgentHandoffResource("today"),
    buildAgentHandoffResource({ kind: "project", project: "{project}" }),
    {
      uri: "orbit://context/today",
      mimeType: "application/json",
      readOnly: true
    }
  ];
}

export function readAgentResource(uri: string, options: AgentReadOptions = {}): AgentResource {
  if (uri === "orbit://context/today") {
    const context = getTodayContext(options.date);
    return {
      descriptor: {
        uri: "orbit://context/today",
        mimeType: "application/json",
        readOnly: true
      },
      content: JSON.stringify(context, null, 2),
      readyForAgent:
        context.activitySessions.length > 0 &&
        (context.knowledgeArtifacts.length > 0 || context.memories.length > 0),
      included: {
        activity: context.activitySessions.length,
        knowledge: context.knowledgeArtifacts.length,
        memory: context.memories.length,
        recommendations: context.recommendations.length,
        evidence: countTodayContextEvidence(context)
      },
      context
    };
  }
  const resource = parseAgentResourceUri(uri);
  return readAgentHandoffResource(resource, {
    orbitHome: getCliConfig().orbitHome,
    ...options
  });
}

function parseAgentResourceUri(uri: string): "today" | { kind: "project"; project: string } {
  if (uri === "orbit://handoff/today") return "today";
  const projectPrefix = "orbit://handoff/project/";
  if (uri.startsWith(projectPrefix)) {
    const encodedProject = uri.slice(projectPrefix.length);
    if (encodedProject.length === 0) {
      throw new Error("Agent Handoff project resource requires a project name.");
    }
    return { kind: "project", project: decodeURIComponent(encodedProject) };
  }
  throw new Error(`Unsupported Orbit agent resource: ${uri}`);
}

function countTodayContextEvidence(context: TodayContext): number {
  return (
    context.activitySessions.reduce((count, session) => count + session.evidence.length, 0) +
    context.knowledgeArtifacts.reduce((count, artifact) => count + artifact.evidence.length, 0) +
    context.memories.reduce((count, memory) => count + memory.evidence.length, 0) +
    context.recommendations.reduce(
      (count, recommendation) => count + recommendation.evidence.length,
      0
    )
  );
}
