import type { ReactElement } from "react";
import type { DesktopSnapshot } from "../orbitApi";
import { Section } from "../components/Section";

export function SettingsPage({ snapshot }: { snapshot: DesktopSnapshot }): ReactElement {
  return (
    <Section title="Local Settings">
      <dl className="settings-grid">
        <div>
          <dt>Orbit Home</dt>
          <dd>{snapshot.orbitHome}</dd>
        </div>
        <div>
          <dt>Database</dt>
          <dd>{snapshot.dbPath}</dd>
        </div>
        <div>
          <dt>AI Provider</dt>
          <dd>{snapshot.settings.aiProvider}</dd>
        </div>
        <div>
          <dt>External Actions</dt>
          <dd>{snapshot.settings.externalActionsEnabled ? "enabled" : "disabled"}</dd>
        </div>
        <div>
          <dt>Screen Capture</dt>
          <dd>{snapshot.settings.screenCaptureEnabled ? "enabled" : "disabled"}</dd>
        </div>
      </dl>
    </Section>
  );
}
