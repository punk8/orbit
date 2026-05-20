import type { ReviewStatus } from "./types/common";
import type { Recommendation } from "./types/recommendation";

const reviewTransitions: Record<ReviewStatus, ReviewStatus[]> = {
  draft: ["needs_review", "confirmed", "rejected", "archived"],
  needs_review: ["confirmed", "rejected", "archived"],
  confirmed: ["needs_review", "archived"],
  rejected: [],
  archived: []
};

const recommendationTransitions: Record<Recommendation["status"], Recommendation["status"][]> = {
  new: ["accepted", "dismissed", "snoozed", "resolved"],
  accepted: ["resolved", "dismissed"],
  dismissed: [],
  snoozed: ["new", "dismissed"],
  resolved: []
};

export function canTransitionReviewStatus(from: ReviewStatus, to: ReviewStatus): boolean {
  return reviewTransitions[from].includes(to);
}

export function assertReviewTransition(from: ReviewStatus, to: ReviewStatus): void {
  if (!canTransitionReviewStatus(from, to)) {
    throw new Error(`Invalid review status transition: ${from} -> ${to}`);
  }
}

export function canTransitionRecommendationStatus(
  from: Recommendation["status"],
  to: Recommendation["status"]
): boolean {
  return recommendationTransitions[from].includes(to);
}

export function assertRecommendationTransition(
  from: Recommendation["status"],
  to: Recommendation["status"]
): void {
  if (!canTransitionRecommendationStatus(from, to)) {
    throw new Error(`Invalid recommendation status transition: ${from} -> ${to}`);
  }
}
