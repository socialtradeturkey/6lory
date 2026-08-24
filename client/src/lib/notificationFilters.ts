export type NotificationFilter = "all" | "unread";

export function filterNotifications<T extends { status: string }>(
  notifications: T[],
  filter: NotificationFilter
) {
  return filter === "unread"
    ? notifications.filter(notification => notification.status === "unread")
    : notifications;
}
