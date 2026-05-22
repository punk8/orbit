import {
  buildAgentHandoffResource,
  readAgentHandoffResource,
  type AgentHandoffResource,
  type AgentHandoffResourceDescriptor
} from "@orbit/agent-api";
import { getCliConfig } from "../config";

export interface AgentReadOptions {
  date?: string;
  generatedAt?: string;
}

export function listAgentResources(): AgentHandoffResourceDescriptor[] {
  return [
    buildAgentHandoffResource("today"),
    buildAgentHandoffResource({ kind: "project", project: "{project}" })
  ];
}

export function readAgentResource(uri: string, options: AgentReadOptions = {}): AgentHandoffResource {
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
