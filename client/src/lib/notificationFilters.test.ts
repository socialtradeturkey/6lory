import { describe, expect, it } from "vitest";
import { filterNotifications } from "./notificationFilters";

describe("bildirim görünürlük filtresi", () => {
  it("okunmamış filtresinde yalnız okunmamış kayıtları gösterir", () => {
    const notifications = [
      { id: 1, status: "unread" },
      { id: 2, status: "read" },
      { id: 3, status: "unread" },
    ];

    expect(filterNotifications(notifications, "unread")).toEqual([
      { id: 1, status: "unread" },
      { id: 3, status: "unread" },
    ]);
  });

  it("tümü filtresinde bildirim listesini değiştirmez", () => {
    const notifications = [{ id: 1, status: "read" }];
    expect(filterNotifications(notifications, "all")).toBe(notifications);
  });
});
