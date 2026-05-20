import type { ReactElement, ReactNode } from "react";

export function Section({
  title,
  action,
  children
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}): ReactElement {
  return (
    <section className="section">
      <div className="section-header">
        <h2>{title}</h2>
        {action ? <div>{action}</div> : null}
      </div>
      {children}
    </section>
  );
}
