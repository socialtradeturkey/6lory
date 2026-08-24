type TimedRecord = { createdAt: Date };
type NotificationRecord = TimedRecord & {
  status: "unread" | "read" | "archived";
  type: string;
};
type SessionRecord = TimedRecord & { status: string };
type VerificationRecord = TimedRecord & { status: string };
type AssignmentRecord = TimedRecord & { status: string };
type RedemptionRecord = TimedRecord & { status: string };

const countBy = <T extends { status: string }>(records: T[], status: string) =>
  records.filter(record => record.status === status).length;

export function buildOperationsAnalytics(input: {
  days: number;
  notifications: NotificationRecord[];
  sessions: SessionRecord[];
  verifications: VerificationRecord[];
  assignments: AssignmentRecord[];
  redemptions: RedemptionRecord[];
}) {
  const notificationRead = countBy(input.notifications, "read");
  const notificationsUnread = countBy(input.notifications, "unread");
  const completedAssignments = countBy(input.assignments, "completed");
  const verifiedSessions = countBy(input.sessions, "verified");
  const verificationPassed = countBy(input.verifications, "pass");
  const verificationManual = countBy(input.verifications, "manual_review");
  const verificationUnavailable = countBy(input.verifications, "unavailable");
  const verificationFailed = countBy(input.verifications, "fail");
  const notificationTypes = Object.entries(
    input.notifications.reduce<Record<string, number>>((acc, notification) => {
      acc[notification.type] = (acc[notification.type] ?? 0) + 1;
      return acc;
    }, {})
  )
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    days: input.days,
    notifications: {
      created: input.notifications.length,
      unread: notificationsUnread,
      read: notificationRead,
      readRatePercent: input.notifications.length
        ? Math.round((notificationRead / input.notifications.length) * 100)
        : 0,
      topTypes: notificationTypes,
    },
    engagement: {
      sessionsStarted: input.sessions.length,
      sessionsVerified: verifiedSessions,
      completedAssignments,
      completionRatePercent: input.assignments.length
        ? Math.round((completedAssignments / input.assignments.length) * 100)
        : 0,
      verifications: {
        total: input.verifications.length,
        passed: verificationPassed,
        manualReview: verificationManual,
        unavailable: verificationUnavailable,
        failed: verificationFailed,
      },
      redemptionsRequested: input.redemptions.length,
    },
  };
}
