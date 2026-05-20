import { describe, expect, it } from "vitest";
import { redactSecrets } from "./index";

describe("privacy redaction", () => {
  it("redacts common secrets and private identifiers", () => {
    const redacted = redactSecrets(
      [
        "authorization: bearer token-123",
        "api_key=sk-test",
        "password=hunter2",
        "person@example.com",
        "https://example.com/private",
        "/Users/alice/project/.env"
      ].join("\n")
    );

    expect(redacted).not.toContain("token-123");
    expect(redacted).not.toContain("sk-test");
    expect(redacted).not.toContain("hunter2");
    expect(redacted).not.toContain("person@example.com");
    expect(redacted).not.toContain("example.com/private");
    expect(redacted).not.toContain("/Users/alice");
  });
});
