export type RedemptionStatus =
  | "requested"
  | "under_review"
  | "approved"
  | "preparing"
  | "shipped"
  | "delivered"
  | "rejected"
  | "cancelled";

const permittedTransitions: Record<RedemptionStatus, RedemptionStatus[]> = {
  requested: ["under_review", "approved", "rejected", "cancelled"],
  under_review: ["approved", "rejected", "cancelled"],
  approved: ["preparing"],
  preparing: ["shipped"],
  shipped: ["delivered"],
  delivered: [],
  rejected: [],
  cancelled: [],
};

export function assertRedemptionTransition(
  current: RedemptionStatus,
  next: RedemptionStatus,
) {
  if (!permittedTransitions[current].includes(next)) {
    throw new Error("REDEMPTION_INVALID_TRANSITION");
  }
}

export function needsRedemptionRefund(
  current: RedemptionStatus,
  next: RedemptionStatus,
) {
  return (
    next === "rejected" || next === "cancelled"
  ) && (current === "requested" || current === "under_review");
}
