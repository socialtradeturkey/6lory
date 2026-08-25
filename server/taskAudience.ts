export type AudienceUser = {
  id: number;
  role: string;
  trustStatus?: string | null;
};

export function isEligibleAudienceUser(user: AudienceUser) {
  return user.role !== "admin" && !["restricted", "suspended"].includes(user.trustStatus ?? "normal");
}

export function planAudienceAssignments(input: {
  eligibleUserIds: number[];
  assignedUserIds: number[];
  targetCount?: number;
  totalQuota: number;
  claimedQuota?: number;
}) {
  const eligibleIds = Array.from(new Set(input.eligibleUserIds));
  const assigned = new Set(input.assignedUserIds);
  const availableIds = eligibleIds.filter(id => !assigned.has(id));
  const remainingQuota = Math.max(0, input.totalQuota - (input.claimedQuota ?? 0));
  const maxAssignable = Math.min(eligibleIds.length, input.assignedUserIds.length + remainingQuota);
  const targetCount = Math.min(
    input.targetCount ?? eligibleIds.length,
    maxAssignable,
  );
  const needed = Math.max(0, targetCount - input.assignedUserIds.length);
  return {
    targetCount,
    selectedUserIds: availableIds.slice(0, needed),
    eligibleUserCount: eligibleIds.length,
    assignedUserCount: input.assignedUserIds.length,
    availableUserCount: availableIds.length,
  };
}
