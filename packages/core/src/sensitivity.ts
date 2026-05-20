import type { Sensitivity } from "./types/common";

const sensitivityRank: Record<Sensitivity, number> = {
  public: 0,
  internal: 1,
  confidential: 2,
  secret: 3
};

export function maxSensitivity(values: Sensitivity[]): Sensitivity {
  return values.reduce<Sensitivity>(
    (current, value) => (sensitivityRank[value] > sensitivityRank[current] ? value : current),
    "public"
  );
}
