import { describe, expect, it } from "vitest";
import { isEligibleAudienceUser, planAudienceAssignments } from "./taskAudience";

describe("task audience assignment", () => {
  it("includes active registered users and excludes only restricted users", () => {
    expect(isEligibleAudienceUser({ id: 1, role: "user", trustStatus: "normal" })).toBe(true);
    expect(isEligibleAudienceUser({ id: 2, role: "user", trustStatus: "watch" })).toBe(true);
    expect(isEligibleAudienceUser({ id: 3, role: "admin", trustStatus: "normal" })).toBe(true);
    expect(isEligibleAudienceUser({ id: 4, role: "user", trustStatus: "restricted" })).toBe(false);
    expect(isEligibleAudienceUser({ id: 5, role: "user", trustStatus: "suspended" })).toBe(false);
  });

  it("plans only new assignments up to the requested target and task quota", () => {
    const result = planAudienceAssignments({
      eligibleUserIds: [10, 10, 11, 12, 13],
      assignedUserIds: [10, 12],
      targetCount: 4,
      totalQuota: 3,
    });
    expect(result).toMatchObject({
      eligibleUserCount: 4,
      assignedUserCount: 2,
      availableUserCount: 2,
      targetCount: 4,
    });
    expect(result.selectedUserIds).toEqual([11, 13]);
  });

  it("does not assign beyond the remaining execution quota", () => {
    const result = planAudienceAssignments({
      eligibleUserIds: [1, 2, 3, 4],
      assignedUserIds: [1],
      targetCount: 4,
      totalQuota: 2,
      claimedQuota: 1,
    });
    expect(result.targetCount).toBe(2);
    expect(result.selectedUserIds).toEqual([2]);
  });

  it("does not add anything when the target is already met", () => {
    const result = planAudienceAssignments({
      eligibleUserIds: [1, 2],
      assignedUserIds: [1, 2],
      targetCount: 2,
      totalQuota: 10,
    });
    expect(result.selectedUserIds).toEqual([]);
  });
});
