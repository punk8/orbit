import { describe, expect, it } from "vitest";
import { agentApiStatus, buildAgentHandoffResource } from "./index";

describe("agent-api handoff descriptors", () => {
  it("exports read-only handoff resource descriptors", () => {
    expect(agentApiStatus.ready).toBe(true);
    expect(buildAgentHandoffResource("today")).toEqual({
      uri: "orbit://handoff/today",
      mimeType: "text/markdown",
      readOnly: true
    });
    expect(buildAgentHandoffResource({ kind: "project", project: "orbit" })).toEqual({
      uri: "orbit://handoff/project/orbit",
      mimeType: "text/markdown",
      readOnly: true
    });
  });
});
