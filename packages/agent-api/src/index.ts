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
