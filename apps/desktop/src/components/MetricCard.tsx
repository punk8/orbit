import type { ReactElement } from "react";

export function MetricCard({
  label,
  value,
  detail
}: {
  label: string;
  value: number | string;
  detail?: string;
}): ReactElement {
  return (
    <div className="metric-card">
      <div className="metric-value">{value}</div>
      <div className="metric-label">{label}</div>
      {detail ? <div className="metric-detail">{detail}</div> : null}
    </div>
  );
}
