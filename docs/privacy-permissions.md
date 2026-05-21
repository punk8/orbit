# Privacy and Permissions

## Privacy Position

Orbit should be local-first by default. It may use external AI providers only when the user explicitly configures them and the requested operation requires sending selected context outside the machine.

The product should optimize for minimum useful persistence:

- Prefer summaries and evidence pointers over raw logs.
- Prefer Knowledge Artifacts and Memories over full raw payloads.
- Retain raw data only when it is needed for traceability, review, or user-requested recall.

## Permission Scopes

Each source adapter must declare its scope before it can run:

```ts
interface PermissionScope {
  sourceKind: SourceKind;
  readableFields: string[];
  canStoreRaw: boolean;
  canStoreSummary: boolean;
  canUseForAI: boolean;
  canExportToAgent: boolean;
  retentionPolicyId: string;
}
```

Initial default:

- Codex: read-only, summary storage allowed, raw storage configurable.
- SeaTalk: read-only, summary storage allowed, raw storage conservative by default.
- Desktop observation: app/window metadata allowed after setup; Accessibility, clipboard, filesystem, screen, OCR, and audio require narrower explicit enablement.
- Screen: disabled until explicitly enabled.
- Calendar, mail, docs, Jira, GitLab: future disabled adapters.

## Sensitivity Classes

- **public**: Safe to store and summarize locally.
- **internal**: Work context, default for most events.
- **confidential**: Sensitive work discussion, code, business data, customer data, private chats.
- **secret**: Credentials, tokens, passwords, keys, regulated data, highly private content.

Secret content should not be sent to AI providers and should not be stored raw unless the user explicitly overrides policy.

## Data Policies

Recommended defaults:

| Data               | Default policy                                     |
| ------------------ | -------------------------------------------------- |
| Event metadata     | Store locally until user deletes or policy expires |
| Raw message text   | Store only when adapter policy allows              |
| Raw command output | Store only if not secret and within retention      |
| App/window metadata | Store locally until user deletes or policy expires |
| Accessibility text | Summary only by default after explicit permission  |
| Clipboard content  | Disabled initially; hash/summary only if enabled   |
| Screen screenshots | Disabled initially; later short TTL by default     |
| Recordings         | Disabled initially; explicit permission required   |
| Knowledge Artifact | Store until deleted or archived                    |
| Memory             | Store until deleted, archived, or superseded       |
| Embeddings         | Rebuildable sidecar, delete when source is deleted |
| Logs               | Short retention, no raw sensitive payloads         |

## Review And Control

The user needs direct controls for:

- Pause/resume capture.
- Disable a source adapter.
- Reconfigure an existing source adapter path/interface.
- Reset a source cursor so it can be re-ingested idempotently.
- View what each adapter can read.
- View what was stored locally.
- Delete an Event, Activity Session, Knowledge Artifact, or Memory.
- Delete all data from a source.
- Run legacy privacy cleanup for old Events that predate the current raw storage policy.
- Export Knowledge and Memory.
- Rebuild indexes.
- Turn off external AI provider usage.

Knowledge Artifacts and Memories should show evidence links. If evidence is deleted, the object should remain but clearly display that evidence is no longer available.

## Redaction

Before persistence or AI use, Orbit should run redaction over text fields where feasible.

Initial redaction targets:

- API keys and tokens.
- Password-like strings.
- Private keys.
- Credit card-like numbers.
- Access cookies.
- Authorization headers.
- Obvious secrets in command output and config files.

Redaction failure should be visible in logs and object metadata. If redaction fails for a sensitive source, Orbit should prefer not to persist raw payloads.

Legacy privacy cleanup should remove `content.text` from old Events when the source permission scope disallows raw storage. Cleanup should keep a bounded summary, preserve Event IDs and source pointers, leave Activity/Knowledge/Memory/Recommendation evidence intact, update redaction state conservatively, and write an audit log.

## External AI Provider Rules

Before sending context to an external provider:

- Check source permission.
- Check sensitivity.
- Minimize payload.
- Prefer Knowledge Artifact excerpts over raw Events.
- Record an AI usage audit entry locally.
- Never send secret content by default.

The audit entry should include provider name, operation type, source object IDs, timestamp, and whether raw text or only summaries were used.

## Agent Interface Rules

External agents should get read-only access by default.

Allowed first:

- Search confirmed Memories.
- Retrieve confirmed Knowledge Artifacts.
- Retrieve Activity summaries.
- Ask for today's or project context.

Guarded:

- Draft a Knowledge Artifact.
- Propose Memory candidates.

Blocked until explicit future design:

- Send messages.
- Modify code.
- Create external tasks.
- Push changes.
- Delete source data outside Orbit.

## Background Observation Special Rules

Background observation is powerful because it runs continuously. It must start with low-risk
metadata and expand only through explicit permission gates.

When implemented:

- Require visible running state.
- Provide pause, resume, stop, and source disable controls.
- Support protected apps and app/window exclusions.
- Prefer app/window metadata before Accessibility text.
- Prefer Accessibility text before OCR.
- Keep raw observation payloads off by default.
- Generate Activity Sessions and Knowledge Artifacts before considering Memory extraction.
- Exclude raw observation payloads from default Handoff and external AI.

See [Background Observation Core Spec](./background-observation-core-spec.md).

## Screen Capture Special Rules

Screen capture is high-risk and must be gated separately from the basic background observation core.

When implemented:

- Require explicit permission and visible running state.
- Provide pause and stop controls.
- Support app/window exclusion.
- Prefer accessibility text before OCR.
- Use short TTL for raw screenshots by default.
- Generate Activity Sessions and Knowledge Artifacts before considering Memory extraction.
