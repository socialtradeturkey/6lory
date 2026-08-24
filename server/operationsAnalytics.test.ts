import { describe, expect, it } from "vitest";
import { buildOperationsAnalytics } from "./operationsAnalytics";

describe("operasyon analitiği", () => {
  it("bildirim okunma oranını ve görev etkileşimini güvenilir biçimde özetler", () => {
    const now = new Date("2026-08-24T12:00:00.000Z");
    const analytics = buildOperationsAnalytics({
      days: 7,
      notifications: [
        { createdAt: now, status: "read", type: "points_earned" },
        { createdAt: now, status: "unread", type: "points_earned" },
        { createdAt: now, status: "read", type: "reward_requested" },
      ],
      sessions: [
        { createdAt: now, status: "verified" },
        { createdAt: now, status: "active" },
      ],
      verifications: [
        { createdAt: now, status: "pass" },
        { createdAt: now, status: "manual_review" },
      ],
      assignments: [
        { createdAt: now, status: "completed" },
        { createdAt: now, status: "started" },
      ],
      redemptions: [{ createdAt: now, status: "requested" }],
    });

    expect(analytics.notifications).toMatchObject({
      created: 3,
      unread: 1,
      read: 2,
      readRatePercent: 67,
    });
    expect(analytics.notifications.topTypes).toContainEqual({
      type: "points_earned",
      count: 2,
    });
    expect(analytics.engagement).toMatchObject({
      sessionsStarted: 2,
      sessionsVerified: 1,
      completedAssignments: 1,
      completionRatePercent: 50,
      redemptionsRequested: 1,
      verifications: { total: 2, passed: 1, manualReview: 1 },
    });
  });
});
